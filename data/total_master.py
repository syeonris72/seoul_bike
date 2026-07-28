"""
ml/baseline.ipynb 셀 8/10/13의 infra_master_df / demand_prediction_master_2024_df
계산 로직을 그대로 재사용해 DB 테이블(infra_master, demand_prediction_master_2024)에
적재하는 영속화 스크립트. 노트북과 분리되어 있어 재실행이 쉽다.

실행: python -m data.total_master
"""
import gc
import logging
from functools import reduce

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import wkt
from sqlalchemy import text

from database.db_connection import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
engine.echo = False  # db_connection.py의 echo=True는 4.5M행 처리 시 로그가 감당 안 됨

# baseline.ipynb 셀 8 - 대여소 위치 좌표 보정 (station_loc 원본에 없는/부정확한 좌표 수기 보정)
HARDCODED_COORDS = {
    'ST-1066': (37.55290, 126.83650), 'ST-1068': (37.54897, 126.84852),
    'ST-1073': (37.50325, 127.12782), 'ST-1074': (37.49830, 127.13454),
    'ST-1090': (37.48083, 127.12933), 'ST-1091': (37.50743, 127.10123),
    'ST-1255': (37.56847, 126.84803), 'ST-1318': (37.53424, 126.89736),
    'ST-1412': (37.50383, 127.13876), 'ST-1415': (37.48161, 127.14361),
    'ST-2':    (37.55088, 126.91039), 'ST-415':  (37.51980, 126.88937),
    'ST-423':  (37.52784, 126.92873), 'ST-989':  (37.54955, 126.91071),
}

# baseline.ipynb 셀 10 - 자치구 코드 -> 자치구명 (station_loc.district에 실제로 존재하는 4개 자치구와 일치)
DISTRICT_MAP = {'11500': '강서구', '11560': '영등포구', '11440': '마포구', '11710': '송파구'}
DISTRICTS = ['강서구', '영등포구', '마포구', '송파구']

INFRA_MASTER_COLUMNS = [
    "station_id", "subway_cnt_300m", "biz_cnt_300m", "edu_cnt_500m",
    "park_cnt_500m", "river_cnt_1km", "dist_subway", "dist_river",
]

def downcast_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """float64/int64 컬럼을 float32/int32로 낮춰 대용량 프레임의 메모리 사용을 절반 가까이 줄인다."""
    for col in df.columns:
        col_type = df[col].dtype
        if col_type != object and not pd.api.types.is_datetime64_any_dtype(col_type):
            if "float" in str(col_type):
                df[col] = df[col].astype(np.float32)
            elif "int" in str(col_type):
                df[col] = df[col].astype(np.int32)
    return df


DEMAND_PREDICTION_MASTER_COLUMNS = [
    "datetime_hr", "station_id",
    "general_rent_cnt", "sprout_rent_cnt", "general_rtn_cnt", "sprout_rtn_cnt",
    "total_use_min", "avg_use_min",
    "rent_male_cnt", "rent_female_cnt", "rent_gender_unk_cnt",
    "rent_age_10_cnt", "rent_age_20_cnt", "rent_age_30_cnt", "rent_age_40_cnt",
    "rent_age_50_cnt", "rent_age_60_cnt", "rent_age_unk_cnt",
    "rtn_male_cnt", "rtn_female_cnt", "rtn_gender_unk_cnt",
    "rtn_age_10_cnt", "rtn_age_20_cnt", "rtn_age_30_cnt", "rtn_age_40_cnt",
    "rtn_age_50_cnt", "rtn_age_60_cnt", "rtn_age_unk_cnt",
    "district", "lat", "lon",
    "subway_cnt_300m", "biz_cnt_300m", "edu_cnt_500m", "park_cnt_500m", "river_cnt_1km",
    "dist_subway", "dist_river",
    "temperature", "precipitation", "snowfall", "pm10",
    "flwpop_tot", "flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up",
    "lvgpop_tot", "lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up",
    "is_holiday", "day_of_week", "is_weekend",
]


def load_source_tables() -> dict[str, pd.DataFrame]:
    logger.info("원본 테이블 로드 시작")
    table_names = [
        "hourly_air_2024", "hourly_precip_2024", "hourly_snow_2024", "hourly_temp_2024",
        "infra_business", "infra_park", "infra_river", "infra_school", "infra_univ", "infra_subway",
        "pop_flow_2024", "pop_living_2024", "korea_holidays", "station_loc", "rent_history_2023",
    ]
    df_dict: dict[str, pd.DataFrame] = {}
    for name in table_names:
        df_dict[name] = pd.read_sql_table(name, con=engine)
        logger.info("  %s: %d행", name, len(df_dict[name]))

    chunk_size = 100_000
    chunks = pd.read_sql_table("rent_history_2024", con=engine, chunksize=chunk_size)
    df_dict["rent_history_2024"] = downcast_numeric(pd.concat(list(chunks), ignore_index=True))
    logger.info("  rent_history_2024: %d행", len(df_dict["rent_history_2024"]))
    df_dict["rent_history_2023"] = downcast_numeric(df_dict["rent_history_2023"])
    return df_dict


def build_env_master(df_dict: dict[str, pd.DataFrame]) -> pd.DataFrame:
    def resample_hourly_env(df, col_name):
        df = df.copy()
        if "id" in df.columns:
            df = df.drop(columns=["id"])
        df["measure_date"] = pd.to_datetime(df["measure_date"])
        df.replace([-9, -9.0], np.nan, inplace=True)
        return df.set_index("measure_date").groupby("region_name")[col_name].resample("1h").mean().reset_index()

    env_dfs = [
        resample_hourly_env(df_dict["hourly_air_2024"], "pm10"),
        resample_hourly_env(df_dict["hourly_temp_2024"], "temperature"),
        resample_hourly_env(df_dict["hourly_precip_2024"], "precipitation"),
        resample_hourly_env(df_dict["hourly_snow_2024"], "snowfall"),
    ]
    env_master_2024_df = reduce(lambda l, r: pd.merge(l, r, on=["measure_date", "region_name"], how="outer"), env_dfs)
    env_master_2024_df = env_master_2024_df.sort_values(by=["region_name", "measure_date"]).reset_index(drop=True)

    env_master_2024_df["temperature"] = env_master_2024_df.groupby("region_name")["temperature"].transform(
        lambda x: x.interpolate(method="linear").ffill()
    )
    env_master_2024_df["pm10"] = env_master_2024_df.groupby("region_name")["pm10"].transform(
        lambda x: x.interpolate(method="linear").ffill()
    )
    env_master_2024_df["temperature"] = env_master_2024_df["temperature"].fillna(env_master_2024_df["temperature"].mean())
    env_master_2024_df["pm10"] = env_master_2024_df["pm10"].fillna(env_master_2024_df["pm10"].mean())
    env_master_2024_df["precipitation"] = env_master_2024_df["precipitation"].fillna(0)
    env_master_2024_df["snowfall"] = env_master_2024_df["snowfall"].fillna(0)

    logger.info("env_master_2024_df 완성: %d행", len(env_master_2024_df))
    return env_master_2024_df


def build_infra_master(df_dict: dict[str, pd.DataFrame]) -> pd.DataFrame:
    station_loc_df = df_dict["station_loc"].copy()
    infra_park_df = df_dict["infra_park"].copy()
    infra_river_df = df_dict["infra_river"].copy()
    infra_subway_df = df_dict["infra_subway"].copy()
    infra_business_df = df_dict["infra_business"].copy()
    infra_school_df = df_dict["infra_school"].copy()
    infra_univ_df = df_dict["infra_univ"].copy()

    station_loc_df["station_id"] = station_loc_df["station_id"].astype(str).str.strip()
    for st_id, (lat, lon) in HARDCODED_COORDS.items():
        mask = station_loc_df["station_id"] == st_id
        station_loc_df.loc[mask, ["lat", "lon"]] = [lat, lon]

    def convert_to_geodataframe(df, wkt_col=None):
        if df.empty:
            return gpd.GeoDataFrame()
        if wkt_col:
            df = df.dropna(subset=[wkt_col]).copy()
            df["geometry"] = df[wkt_col].apply(lambda x: wkt.loads(str(x)) if pd.notna(x) and str(x) != "None" else None)
            df = df.dropna(subset=["geometry"])
            gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
        else:
            lat_col = "latitude" if "latitude" in df.columns else "lat" if "lat" in df.columns else None
            lon_col = "longitude" if "longitude" in df.columns else "lon" if "lon" in df.columns else "lot" if "lot" in df.columns else None
            if not lat_col or not lon_col:
                return gpd.GeoDataFrame()
            df = df.dropna(subset=[lat_col, lon_col]).copy()
            gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col].astype(float), df[lat_col].astype(float)), crs="EPSG:4326")
        return gdf.to_crs(epsg=5179)[~gdf.is_empty]

    def count_infra_within_radius(tgt, src, r, col):
        if src is None or src.empty:
            return pd.Series(0, index=tgt.index, name=col)
        buf = tgt.copy()
        buf["geometry"] = buf.geometry.buffer(r)
        joined = gpd.sjoin(buf, src, how="left", predicate="intersects")
        return joined.groupby(joined.index)["index_right"].count().rename(col)

    def calculate_nearest_distance(tgt, src, col):
        if src is None or src.empty:
            return pd.DataFrame({col: [np.nan] * len(tgt)}, index=tgt.index)
        nearest = gpd.sjoin_nearest(tgt, src, distance_col=col)
        return nearest[~nearest.index.duplicated(keep="first")][[col]]

    station_loc_gdf = convert_to_geodataframe(station_loc_df)
    infra_park_df["lon"] = infra_park_df["xcrd_g"].fillna(infra_park_df["xcrd"])
    infra_park_df["lat"] = infra_park_df["ycrd_g"].fillna(infra_park_df["ycrd"])
    infra_subway_df["lon"] = pd.to_numeric(infra_subway_df.get("lon", infra_subway_df.get("lot")), errors="coerce")

    infra_park_gdf = convert_to_geodataframe(infra_park_df)
    infra_river_gdf = convert_to_geodataframe(infra_river_df, wkt_col="geom_wkt")
    infra_subway_gdf = convert_to_geodataframe(infra_subway_df)
    infra_business_gdf = convert_to_geodataframe(infra_business_df)
    infra_edu_gdf = pd.concat([convert_to_geodataframe(infra_school_df), convert_to_geodataframe(infra_univ_df)], ignore_index=True)

    infra_master_df = station_loc_gdf.copy()
    infra_master_df["subway_cnt_300m"] = count_infra_within_radius(infra_master_df, infra_subway_gdf, 300, "subway_cnt_300m")
    infra_master_df["biz_cnt_300m"] = count_infra_within_radius(infra_master_df, infra_business_gdf, 300, "biz_cnt_300m")
    infra_master_df["edu_cnt_500m"] = count_infra_within_radius(infra_master_df, infra_edu_gdf, 500, "edu_cnt_500m")
    infra_master_df["park_cnt_500m"] = count_infra_within_radius(infra_master_df, infra_park_gdf, 500, "park_cnt_500m")
    infra_master_df["river_cnt_1km"] = count_infra_within_radius(infra_master_df, infra_river_gdf, 1000, "river_cnt_1km")

    infra_master_df = infra_master_df.join(calculate_nearest_distance(infra_master_df, infra_subway_gdf, "dist_subway"))
    infra_master_df = infra_master_df.join(calculate_nearest_distance(infra_master_df, infra_river_gdf, "dist_river"))

    infra_master_df = infra_master_df.drop(columns=["geometry"])
    logger.info("infra_master_df 완성: %d행", len(infra_master_df))
    return infra_master_df


def build_pop_master(df_dict: dict[str, pd.DataFrame]) -> pd.DataFrame:
    pop_living_2024_df = df_dict["pop_living_2024"].copy()
    pop_flow_2024_df = df_dict["pop_flow_2024"].copy()

    pop_living_2024_df["district_name"] = pop_living_2024_df["adstrd_code_se"].map(DISTRICT_MAP)
    pop_living_2024_df.rename(columns={"tot_lvpop_co": "lvgpop_tot"}, inplace=True)

    age_groups = {
        "lvgpop_10s": ["male_f10t14_lvpop_co", "male_f15t19_lvpop_co", "female_f10t14_lvpop_co", "female_f15t19_lvpop_co"],
        "lvgpop_20s": ["male_f20t24_lvpop_co", "male_f25t29_lvpop_co", "female_f20t24_lvpop_co", "female_f25t29_lvpop_co"],
        "lvgpop_30s": ["male_f30t34_lvpop_co", "male_f35t39_lvpop_co", "female_f30t34_lvpop_co", "female_f35t39_lvpop_co"],
        "lvgpop_40s": ["male_f40t44_lvpop_co", "male_f45t49_lvpop_co", "female_f40t44_lvpop_co", "female_f45t49_lvpop_co"],
        "lvgpop_50s": ["male_f50t54_lvpop_co", "male_f55t59_lvpop_co", "female_f50t54_lvpop_co", "female_f55t59_lvpop_co"],
        "lvgpop_60up": ["male_f60t64_lvpop_co", "male_f65t69_lvpop_co", "male_f70t74_lvpop_co",
                        "female_f60t64_lvpop_co", "female_f65t69_lvpop_co", "female_f70t74_lvpop_co"],
    }
    for col, src_cols in age_groups.items():
        pop_living_2024_df[col] = pop_living_2024_df[src_cols].sum(axis=1)

    pop_living_2024_df = pop_living_2024_df[["stdr_de_id", "tmzon_pd_se", "district_name", "lvgpop_tot"] + list(age_groups.keys())].copy()
    pop_living_2024_df["date_str"] = pop_living_2024_df["stdr_de_id"].astype(str)
    pop_living_2024_df["hour_str"] = pop_living_2024_df["tmzon_pd_se"].astype(str).str.zfill(2)

    date_rng = pd.date_range(start="2024-01-01", end="2024-12-31 23:00:00", freq="h")
    pop_master_list = []
    for dist in DISTRICTS:
        df_temp = pd.DataFrame(date_rng, columns=["datetime"])
        df_temp["district_name"] = dist
        df_temp["date_str"] = df_temp["datetime"].dt.strftime("%Y%m%d")
        df_temp["hour_str"] = df_temp["datetime"].dt.strftime("%H")
        df_temp["weekday"] = df_temp["datetime"].dt.weekday
        df_temp["quarter_str"] = "2024" + df_temp["datetime"].dt.quarter.astype(str)
        pop_master_list.append(df_temp)
    pop_master_2024_df = pd.concat(pop_master_list, ignore_index=True)

    pop_flow_2024_df = pd.merge(
        pop_master_2024_df, pop_flow_2024_df,
        left_on=["quarter_str", "district_name"], right_on=["stdr_yyqu_cd", "signgu_cd_nm"],
        how="left",
    )

    h = pop_flow_2024_df["hour_str"].astype(int)
    wd = pop_flow_2024_df["weekday"]

    div = np.select(
        [h.isin(range(6, 11)), h.isin(range(11, 17)), h.isin(range(17, 21)), h.isin(range(21, 24))],
        [5, 3, 4, 3], default=6,
    )
    time_pop = np.select(
        [h.isin(range(0, 6)), h.isin(range(6, 11)), h.isin(range(11, 14)), h.isin(range(14, 17)), h.isin(range(17, 21))],
        [pop_flow_2024_df["tmzon_00_06_flpop_co"], pop_flow_2024_df["tmzon_06_11_flpop_co"],
         pop_flow_2024_df["tmzon_11_14_flpop_co"], pop_flow_2024_df["tmzon_14_17_flpop_co"],
         pop_flow_2024_df["tmzon_17_21_flpop_co"]],
        default=pop_flow_2024_df["tmzon_21_24_flpop_co"],
    )
    day_pop = np.select(
        [wd == 0, wd == 1, wd == 2, wd == 3, wd == 4, wd == 5, wd == 6],
        [pop_flow_2024_df["mon_flpop_co"], pop_flow_2024_df["tues_flpop_co"], pop_flow_2024_df["wed_flpop_co"],
         pop_flow_2024_df["thur_flpop_co"], pop_flow_2024_df["fri_flpop_co"], pop_flow_2024_df["sat_flpop_co"],
         pop_flow_2024_df["sun_flpop_co"]],
        default=0,
    )

    tot_pop = pop_flow_2024_df["tot_flpop_co"].fillna(0)
    valid = tot_pop > 0

    est_tot_flwpop = np.zeros(len(pop_flow_2024_df))
    est_tot_flwpop[valid] = (time_pop[valid] / div[valid]) * (day_pop[valid] / tot_pop[valid]) / 13
    pop_flow_2024_df["flwpop_tot"] = est_tot_flwpop

    age_map = {
        "agrde_10_flpop_co": "flwpop_10s", "agrde_20_flpop_co": "flwpop_20s", "agrde_30_flpop_co": "flwpop_30s",
        "agrde_40_flpop_co": "flwpop_40s", "agrde_50_flpop_co": "flwpop_50s", "agrde_60_above_flpop_co": "flwpop_60up",
    }
    for origin, new in age_map.items():
        pop_flow_2024_df[new] = np.where(valid, est_tot_flwpop * (pop_flow_2024_df[origin] / tot_pop), 0)

    pop_master_2024_df = pd.merge(
        pop_flow_2024_df, pop_living_2024_df,
        on=["date_str", "hour_str", "district_name"], how="left",
    )

    pop_cols = [
        "datetime", "district_name",
        "flwpop_tot", "flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up",
        "lvgpop_tot", "lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up",
    ]
    pop_master_2024_df = pop_master_2024_df[pop_cols]

    pop_cols_to_fill = [
        "flwpop_tot", "flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up",
        "lvgpop_tot", "lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up",
    ]
    for col in pop_cols_to_fill:
        pop_master_2024_df[col] = pop_master_2024_df.groupby("district_name")[col].transform(
            lambda x: x.fillna(x.median())
        )

    logger.info("pop_master_2024_df 완성: %d행", len(pop_master_2024_df))
    return pop_master_2024_df


def build_demand_predict_master(
    df_dict: dict[str, pd.DataFrame],
    infra_master_df: pd.DataFrame,
    env_master_2024_df: pd.DataFrame,
    pop_master_2024_df: pd.DataFrame,
) -> pd.DataFrame:
    station_loc_df = df_dict["station_loc"]
    korea_holidays_df = df_dict["korea_holidays"].copy()

    rent_history_df = pd.concat(
        [df_dict.pop("rent_history_2023"), df_dict.pop("rent_history_2024")],
        ignore_index=True,
    )
    rent_history_df["station_id"] = rent_history_df["station_id"].astype(str).str.strip()

    # rent_history_2023 수집 구간이 2024-01-01 새벽까지 겹쳐 (datetime_hr, station_id) PK가
    # 중복되는 행이 소수 존재한다 (수집 스크립트의 경계 중복, 알려진 데이터 이슈).
    # demand_prediction_master_2024의 PK 제약 때문에 유지해야 하므로, 뒤에 온 2024년 원본 값을 남긴다.
    before = len(rent_history_df)
    rent_history_df = rent_history_df.drop_duplicates(subset=["datetime_hr", "station_id"], keep="last")
    dropped = before - len(rent_history_df)
    if dropped:
        logger.warning("  rent_history 2023/2024 경계 중복 %d행 제거 (2024년 값 유지)", dropped)
    gc.collect()

    demand_prediction_master_2024_df = pd.merge(
        rent_history_df,
        station_loc_df[["station_id", "district", "lat", "lon"]],
        on="station_id",
        how="left",
    )
    del rent_history_df
    gc.collect()
    logger.info("  station_loc 병합 완료: %d행", len(demand_prediction_master_2024_df))

    infra_cols = [
        "station_id", "subway_cnt_300m", "biz_cnt_300m", "edu_cnt_500m",
        "park_cnt_500m", "river_cnt_1km", "dist_subway", "dist_river",
    ]
    demand_prediction_master_2024_df = pd.merge(
        demand_prediction_master_2024_df,
        infra_master_df[infra_cols],
        on="station_id",
        how="left",
    )
    demand_prediction_master_2024_df = downcast_numeric(demand_prediction_master_2024_df)
    gc.collect()
    logger.info("  infra 병합 완료: %d행", len(demand_prediction_master_2024_df))

    demand_prediction_master_2024_df["datetime_hr"] = pd.to_datetime(demand_prediction_master_2024_df["datetime_hr"])
    env_master_2024_df["measure_date"] = pd.to_datetime(env_master_2024_df["measure_date"])

    env_cols = ["measure_date", "region_name", "temperature", "precipitation", "snowfall", "pm10"]
    demand_prediction_master_2024_df = pd.merge(
        demand_prediction_master_2024_df,
        env_master_2024_df[env_cols],
        left_on=["datetime_hr", "district"],
        right_on=["measure_date", "region_name"],
        how="left",
    )
    demand_prediction_master_2024_df.drop(columns=["measure_date", "region_name"], inplace=True)
    demand_prediction_master_2024_df = downcast_numeric(demand_prediction_master_2024_df)
    gc.collect()
    logger.info("  env 병합 완료: %d행", len(demand_prediction_master_2024_df))

    pop_master_2024_df["datetime"] = pd.to_datetime(pop_master_2024_df["datetime"])
    demand_prediction_master_2024_df = pd.merge(
        demand_prediction_master_2024_df,
        pop_master_2024_df,
        left_on=["datetime_hr", "district"],
        right_on=["datetime", "district_name"],
        how="left",
    )
    demand_prediction_master_2024_df.drop(columns=["datetime", "district_name"], inplace=True)
    demand_prediction_master_2024_df = downcast_numeric(demand_prediction_master_2024_df)
    gc.collect()
    logger.info("  pop 병합 완료: %d행", len(demand_prediction_master_2024_df))

    demand_prediction_master_2024_df["temp_date"] = demand_prediction_master_2024_df["datetime_hr"].dt.date
    korea_holidays_df["holiday_date"] = pd.to_datetime(korea_holidays_df["holiday_date"]).dt.date

    demand_prediction_master_2024_df = pd.merge(
        demand_prediction_master_2024_df,
        korea_holidays_df[["holiday_date", "holiday_name"]],
        left_on="temp_date",
        right_on="holiday_date",
        how="left",
    )

    demand_prediction_master_2024_df["is_holiday"] = demand_prediction_master_2024_df["holiday_name"].notna().astype(int)
    demand_prediction_master_2024_df["day_of_week"] = demand_prediction_master_2024_df["datetime_hr"].dt.dayofweek
    demand_prediction_master_2024_df["is_weekend"] = (demand_prediction_master_2024_df["day_of_week"] >= 5).astype(int)

    demand_prediction_master_2024_df.drop(columns=["temp_date", "holiday_date", "holiday_name"], inplace=True)

    fill_zero_cols = [
        "precipitation", "snowfall", "subway_cnt_300m",
        "biz_cnt_300m", "edu_cnt_500m", "park_cnt_500m", "river_cnt_1km",
    ]
    demand_prediction_master_2024_df[fill_zero_cols] = demand_prediction_master_2024_df[fill_zero_cols].fillna(0)

    logger.info("demand_prediction_master_2024_df 완성: %d행", len(demand_prediction_master_2024_df))
    return demand_prediction_master_2024_df


def persist(infra_out: pd.DataFrame, demand_out: pd.DataFrame) -> None:
    with engine.begin() as conn:
        logger.info("기존 infra_master / demand_prediction_master_2024 행 삭제")
        conn.execute(text("DELETE FROM infra_master"))
        conn.execute(text("DELETE FROM demand_prediction_master_2024"))

    logger.info("infra_master 적재 시작 (%d행)", len(infra_out))
    infra_out.to_sql("infra_master", con=engine, if_exists="append", index=False, chunksize=5_000)
    logger.info("infra_master 적재 완료")

    logger.info("demand_prediction_master_2024 적재 시작 (%d행)", len(demand_out))
    demand_out.to_sql("demand_prediction_master_2024", con=engine, if_exists="append", index=False, chunksize=20_000)
    logger.info("demand_prediction_master_2024 적재 완료")


def main() -> None:
    df_dict = load_source_tables()

    env_master_2024_df = build_env_master(df_dict)
    infra_master_df = build_infra_master(df_dict)
    pop_master_2024_df = build_pop_master(df_dict)

    demand_prediction_master_2024_df = build_demand_predict_master(
        df_dict, infra_master_df, env_master_2024_df, pop_master_2024_df
    )
    del df_dict, env_master_2024_df, pop_master_2024_df
    gc.collect()

    infra_out = infra_master_df[INFRA_MASTER_COLUMNS]
    demand_out = demand_prediction_master_2024_df[DEMAND_PREDICTION_MASTER_COLUMNS]
    del infra_master_df, demand_prediction_master_2024_df
    gc.collect()

    persist(infra_out, demand_out)

    del infra_out, demand_out
    gc.collect()
    logger.info("전체 완료")


if __name__ == "__main__":
    main()
