# 서울자전거 따릉이 수요예측 API

서울시 공공자전거(따릉이) 대여소별 수요를 예측하고, 관리자/드라이버/이용자용 대시보드를 제공하는 FastAPI 기반 백엔드 프로젝트입니다.

## 기술 스택

- **Web**: FastAPI, Uvicorn, Pydantic
- **DB**: SQLAlchemy, PyMySQL, Alembic (마이그레이션)
- **Auth**: PyJWT, pwdlib(argon2)
- **ML/분석**: scikit-learn, LightGBM, XGBoost, Optuna, MLflow(모델 관리), pandas/numpy/geopandas
- **스케줄링**: APScheduler
- **프론트엔드**: 별도 프레임워크 없이 정적 HTML/CSS/JS (`static/`)

## 디렉토리 구조

```
seoul_bike/
├── main.py                 # FastAPI 앱 진입점 (lifespan, 라우터 등록, CORS, 정적 파일 마운트)
│
├── routers/                # API 엔드포인트 (도메인별)
│   ├── auth.py              # 로그인/인증
│   ├── user.py               # 이용자 API
│   ├── admin.py               # 관리자 API
│   ├── driver.py              # 드라이버(재배치 기사) API
│   ├── station.py              # 대여소 API
│   ├── predict.py               # 수요예측 API
│   ├── analytics.py              # 통계/분석 API
│   └── config.py                  # 설정/공통 API
│
├── schema/                 # Pydantic 요청/응답 스키마
│   ├── request.py
│   └── response.py
│
├── models/                 # ORM 모델 정의
│   └── models.py
│
├── database/                # DB 연결/세션 관리
│   ├── db_connection.py
│   └── orm.py
│
├── auth/                    # 인증/보안 유틸
│   ├── jwt.py                # JWT 발급/검증
│   ├── password.py            # 비밀번호 해싱
│   └── deps.py                 # 인증 의존성 (FastAPI Depends)
│
├── serving/                 # 예측/서빙 관련 비즈니스 로직
│   ├── mlflow_setup.py         # MLflow 환경 설정
│   ├── mlflow_model_load.py     # 챔피언 모델 로딩
│   ├── demand_prediction_forecast.py  # 수요 예측 로직
│   ├── feature.py, feature_group.py    # 피처 엔지니어링
│   ├── target_encoding.py               # 타겟 인코딩 캐시
│   ├── station_lookup.py, station_stock.py, bike_split.py  # 대여소/재고 관련 로직
│   ├── env.py, env_history.py            # 환경(날씨 등) 데이터
│   ├── rent_history.py                    # 대여 이력
│   ├── district.py, mapping.py, constant.py  # 지역/매핑/상수
│   ├── analytics_utils.py                  # 통계 유틸
│   ├── scheduler.py                          # 배치/스케줄러 (APScheduler)
│   └── deps.py                                # 서빙 관련 의존성
│
├── data/                    # 원본 데이터 수집·적재 스크립트 (배치성)
│   ├── collect_*.py          # 외부 데이터 수집 (실시간, 환경, 인구, 인프라, 임대료 이력 등)
│   ├── common_utils.py
│   ├── init_tables.py, reset_db.py   # DB 초기화
│   ├── seed_accounts.py               # 테스트 계정 시딩
│   ├── fix_station_loc.py, backfill_neighborhood.py  # 데이터 보정
│   ├── total_master.py
│   ├── infra_river_SHP/               # 하천 GIS(Shapefile) 데이터
│   ├── rent_history/                  # 임대료 이력 SQL
│   └── backups/                       # 데이터 백업 (스크립트 실행 전 스냅샷)
│
├── ml/                       # 모델 개발용 노트북
│   ├── baseline.ipynb
│   └── ensemble.ipynb
│
├── models_pkl/                # 학습/검증용 피클 데이터 (train/val/test split)
│   └── train_pkl/
│
├── static/                     # 프론트엔드 정적 파일
│   ├── index.html, admin-*.html, driver-*.html, user-*.html, settings.html
│   ├── css/                     # 페이지별 스타일시트
│   ├── js/                       # 페이지별 스크립트 (api.js가 공통 API 클라이언트)
│   └── img/                       # 로고/이미지 리소스
│
├── mlflow.db                   # MLflow 트래킹 로컬 DB (SQLite)
├── requirements.txt             # Python 의존성
└── .env                          # 환경변수 (커밋 제외 대상)
```

## 계층 흐름

```
static/ (프론트엔드)
    │  fetch (static/js/api.js)
    ▼
routers/ (API 엔드포인트, 인증은 auth/deps.py 의존)
    │
    ├─▶ schema/ (요청 검증 · 응답 직렬화)
    ├─▶ serving/ (비즈니스 로직 · 예측/피처/집계)
    │        └─▶ models/, database/ (ORM · DB 세션)
    └─▶ models/ (ORM 모델) ─▶ database/ (DB 연결)

data/  → (배치 실행) →  DB
ml/    → (모델 개발) →  MLflow →  serving/mlflow_model_load.py
```

## 실행 방법

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

정적 프론트엔드는 `/static` 경로로 함께 서빙됩니다 (예: `http://localhost:8000/static/index.html`).
