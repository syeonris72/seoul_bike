import os

import mlflow
from dotenv import load_dotenv


def configure_mlflow_environment() -> None:
    """
    FastAPI 앱 시작 시 다른 mlflow.* 호출보다 먼저 한 번만 호출한다.
    ml/ensemble.ipynb의 환경 설정 셀과 동일한 방식으로 MLflow 트래킹 서버와
    Supabase Storage(S3 호환, MLflow 아티팩트 백엔드)를 연동한다.
    """
    load_dotenv()

    mlflow_tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "")
    mlflow.set_tracking_uri(mlflow_tracking_uri)
    print(f"========== MLflow 연동 완료: {mlflow_tracking_uri} ==========")

    if os.getenv("SUPABASE_S3_ENDPOINT_URL"):
        os.environ["MLFLOW_S3_ENDPOINT_URL"] = os.getenv("SUPABASE_S3_ENDPOINT_URL")
        os.environ["AWS_ACCESS_KEY_ID"] = os.getenv("SUPABASE_ACCESS_KEY_ID", "")
        os.environ["AWS_SECRET_ACCESS_KEY"] = os.getenv("SUPABASE_SECRET_ACCESS_KEY", "")
        os.environ["AWS_REGION"] = os.getenv("SUPABASE_REGION", "ap-northeast-2")
        print("========== Supabase Storage 연동 완료 ==========")
