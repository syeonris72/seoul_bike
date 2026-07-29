# 🚲 서울시 따릉이 대여 수요 예측 및 재배치 최적화 웹 서비스 (Seoul Bike Demand Prediction)

서울시 공공자전거(따릉이)의 시간대별/대여소별 대여 수요를 AI로 예측하고, 이를 바탕으로 관제 센터 및 배송 기사의 최적 재배치 운영을 지원하는 풀스택 데이터 분석 웹 서비스입니다.

## 🎯 프로젝트 개요
- **목표:** 기상, 환경, 유동/생활인구, 공간 인프라 등 복합적인 외부 요인을 반영한 수요 예측 모델 구축 및 자전거 재배치 전략 최적화
- **타깃 자치구:** 영등포구(여의도 포함), 마포구, 송파구, 강서구(마곡지구)
- **주요 기능:**
  - AI 기반 대여소별 실시간 수요 예측 및 만성 불균형(고갈/과포화) 대여소 탐지
  - 공간 히트맵 및 Sankey 다이어그램을 활용한 자전거 이동 흐름 시각화 대시보드
  - 관리자(관제 센터) 및 기사(재배치 수행) 권한별 맞춤형 인터페이스 제공

---

## 🛠️ 기술 스택 (Tech Stack)

### Data Engineering & MLOps
- **Data Analysis & GIS:** `pandas`, `numpy`, `geopandas`, `shapely`, `scipy`
- **Machine Learning:** `scikit-learn`, `LightGBM`, `XGBoost`
- **MLOps & Tuning:** `MLflow` (실험 트래킹 및 모델 레지스트리), `Optuna` (하이퍼파라미터 튜닝)

### Backend & Serving
- **Framework:** `FastAPI`, `Uvicorn`, `Pydantic`
- **Database & ORM:** `SQLAlchemy`, `Alembic`, `PyMySQL`
- **Authentication:** `PyJWT`, `pwdlib` (Argon2)
- **Storage:** `Supabase` S3 Storage (`boto3`)

### Frontend
- **UI / Data Visualization:** `HTML/CSS/JS`, `Bootstrap 5`, `Chart.js` (Sankey Plugin 포함), Kakao Map API

---

## 📂 프로젝트 구조 (Directory Structure)
실무 수준의 유지보수성과 확장성을 고려하여 책임을 분리한 모듈형 구조를 채택했습니다.

```text
📦seoul_bike
 ┣ 📂auth            # JWT 기반 사용자 인증 및 권한 관리 라우터
 ┣ 📂data            # 도메인별 데이터 수집 모듈 (따릉이, 환경, 인구, 인프라 등)
 ┣ 📂database        # 데이터베이스 연결 세션 및 ORM 모델 정의
 ┣ 📂ml              # 데이터 전처리, 피처 엔지니어링, 모델 학습(Train) 파이프라인
 ┣ 📂models_pkl      # 학습된 챔피언 모델 로컬 저장소 (.gitignore 적용 대상)
 ┣ 📂routers         # FastAPI 엔드포인트 (Admin, User, Predict 등 역할별 분리)
 ┣ 📂schema          # Pydantic을 활용한 API 요청/응답 데이터 검증 스키마
 ┣ 📂serving         # 모델 추론(Inference), MLflow 연동, Target Encoding 캐시 관리
 ┣ 📂static          # 프론트엔드 정적 파일 (UI 화면, JS 스크립트, CSS)
 ┣ 📜main.py         # FastAPI 애플리케이션 진입점 (Lifespan 모델 로드)
 ┣ 📜mlflow.db       # MLflow 실험 및 튜닝 이력 트래킹 로컬 DB
 ┣ 📜requirements.txt# 프로젝트 의존성 라이브러리 명세서
 ┗ 📜.env            # API Keys, DB, Supabase 등 환경변수 (보안)