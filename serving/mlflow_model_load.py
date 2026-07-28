import logging
from typing import Any

import mlflow
import mlflow.sklearn

from serving.constant import FINAL_TEST_STAGE_TAG, MLFLOW_EXPERIMENT_NAME, TARGET_COLUMNS

logger = logging.getLogger(__name__)


def _find_latest_final_test_run(target: str, experiment_name: str = MLFLOW_EXPERIMENT_NAME) -> tuple[str, str]:
    """
    (target에 해당하는) 타깃별 챔피언 모델이 로깅된 가장 최근 FinalTest_{target} run을 찾는다.
    ensemble.ipynb의 get_best_params_from_mlflow와 동일한 search_runs 패턴을 사용한다.
    반환값: (run_id, model_type_tag)
    """
    experiment = mlflow.get_experiment_by_name(experiment_name)
    if experiment is None:
        raise RuntimeError(f"MLflow 실험 '{experiment_name}'을 찾을 수 없습니다.")

    runs = mlflow.search_runs(
        experiment_ids=[experiment.experiment_id],
        filter_string=f"tags.stage = '{FINAL_TEST_STAGE_TAG}' and tags.target = '{target}'",
        order_by=["start_time DESC"],
        max_results=1,
    )

    if runs.empty:
        raise RuntimeError(f"'{target}'에 대한 FinalTest run을 찾을 수 없습니다. ensemble.ipynb의 최종 테스트 셀을 먼저 실행해야 합니다.")

    run_id = runs.iloc[0]["run_id"]
    model_type = runs.iloc[0].get("tags.model", "unknown")
    return run_id, model_type


def _get_logged_model_id(run_id: str) -> str:
    """
    MLflow 3.x는 mlflow.sklearn.log_model(..., name=...)로 로깅한 모델을 기존
    runs:/{run_id}/{artifact_path} 방식이 아니라 별도의 "Logged Model" 리소스로
    저장한다 (run.outputs.model_outputs[i].model_id). runs:/ URI로 다운로드를
    시도하면 "Failed to download artifacts from path 'model'"로 조용히 실패하므로
    반드시 이 model_id를 거쳐 models:/{model_id} 형태로 로드해야 한다.
    """
    run = mlflow.get_run(run_id)
    model_outputs = run.outputs.model_outputs if run.outputs else []
    if not model_outputs:
        raise RuntimeError(f"run_id={run_id}에 로깅된 모델이 없습니다 (outputs.model_outputs 비어있음).")
    return model_outputs[0].model_id


def load_champion_models() -> dict[str, Any]:
    """
    타깃별 챔피언 모델을 MLflow에서 불러와 {target_name: fitted_model} dict로 반환한다.
    FastAPI startup(lifespan)에서 한 번 호출해 app.state에 캐싱해두고 재사용한다.
    """
    models: dict[str, Any] = {}

    for target in TARGET_COLUMNS:
        run_id, model_type = _find_latest_final_test_run(target)
        model_id = _get_logged_model_id(run_id)
        model = mlflow.sklearn.load_model(f"models:/{model_id}")
        models[target] = model
        logger.info(
            "[챔피언 모델 로드 완료] target=%s, model=%s, run_id=%s, model_id=%s",
            target, model_type, run_id, model_id,
        )

    return models
