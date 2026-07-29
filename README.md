# 🚲 서울시 따릉이 대여 수요 예측 및 재배치 운영 지원 시스템
> **Seoul Bike Demand Prediction & Dispatch Management System** <br>
> 서울시 공공자전거(따릉이)의 수요를 AI로 예측하고, 관리자·배송 기사·사용자를 위한 맞춤형 웹 대시보드와 최적의 재배치(Dispatch) 운영을 지원하는 풀스택 웹 서비스입니다.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![MLflow](https://img.shields.io/badge/MLflow-0194E2?style=flat-square&logo=mlflow&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap_5-7952B3?style=flat-square&logo=bootstrap&logoColor=white)

## 1. 🎯 프로젝트 소개
본 프로젝트는 **FastAPI 백엔드**와 **MLflow 기반 수요 예측 모델**을 결합하여, 단순한 예측을 넘어 실제 운영 인력(관제 센터 및 재배치 기사)과 일반 사용자가 유기적으로 상호작용할 수 있는 종합 운영 지원 시스템을 구축하는 것을 목표로 합니다.

---

## 2. ✨ 주요 기능 (Key Features)
- **📊 대여소별 수요 예측 모델링 및 서빙** (`routers/predict.py`)
  - MLflow 챔피언 모델을 로드하여 실시간/시간대별 자전거 대여 수요 예측 제공
- **🏢 관리자(Admin) 대시보드 & 분석** (`routers/analytics.py`)
  - 전체 대여소 현황 분석 및 통계 제공 (`admin-dashboard.html`, `admin-analytics.html`)
  - 만성 고갈 및 과포화 대여소 탐지 기반의 재배치(디스패치) 지시 관리 (`admin-dispatch.html`)
- **🚚 드라이버(Driver) 재배치 지원** (`routers/driver.py`)
  - 배송 기사용 실시간 지도 및 최적 이동 경로 안내 (`driver-map.html`)
- **📱 사용자(User) 인터페이스** (`routers/user.py`)
  - 일반 사용자용 자전거 대여 기능 및 이용 내역 대시보드 (`user-dashboard.html`, `user-rental.html`)
- **🔒 보안 및 인증** (`auth/`)
  - JWT 기반의 안전한 API 접근 제어 및 사용자 권한(Admin/Driver/User) 분리
- **⚙️ 자동화 스케줄러** (`serving/scheduler.py`)
  - 주기적인 외부 데이터(기상, 인구 등) 수집 및 ML 모델 갱신 스케줄링

---

## 3. 🛠️ 기술 스택 (Tech Stack)

### ⚙️ Backend
- **Framework & Server:** `FastAPI` + `Uvicorn` (REST API 서버)
- **Data Validation:** `Pydantic`
- **Database & ORM:** `MySQL` (`PyMySQL`), `SQLAlchemy`, `Alembic`
- **Auth & Security:** `JWT` (`PyJWT`) + `pwdlib` (`argon2`)
- **Scheduling:** `APScheduler` (실시간 데이터 수집 및 예측 갱신 스케줄링)

### 🧠 Machine Learning & MLOps
- **Algorithms:** `scikit-learn`, `XGBoost`, `LightGBM` (수요예측 모델)
- **Tuning:** `Optuna` (하이퍼파라미터 튜닝)
- **MLOps:** `MLflow` (실험 관리 및 Champion 모델 서빙)
- **Data Analysis:** `pandas`, `numpy`, `scipy`, `geopandas` (데이터 전처리 및 분석)

### 📡 Data Collection (외부 Open API 연동)
- **Public Data API:** 
  - 서울 열린데이터광장 (대여소 정보, 대여 이력, 실시간 현황, 인프라 데이터)
  - 기상청 API허브(KMA) (기온, 미세먼지 등 기상 데이터)
  - 공공데이터포털 (실시간 초단기예보, 대기오염 측정 데이터)
- **Crawling & Requests:** `BeautifulSoup4`, `requests`
- **Features:** `holidays` (공휴일 피처 추출)

### 🖥️ Frontend
- **Core:** `Vanilla JS` / `HTML` / `CSS`, `Pretendard` (웹폰트)
- **UI Components:** `Bootstrap 5.3.3` + `Bootstrap Icons`
- **Visualization:** `Chart.js` (+ `chartjs-chart-sankey`), `Kakao Map API` (지도 시각화)
- **Scanner:** `html5-qrcode` (자전거 대여/반납용 QR코드 스캔)

### ☁️ Infra
- **Storage:** `Supabase Storage` (MLflow 아티팩트 저장소, S3 호환)
- **Client:** `boto3` (Supabase Storage 연동 클라이언트)

---

## 4. 📂 프로젝트 구조 (Directory Structure)

```text
📦 seoul_bike
 ┣ 📂 .claude/       # Claude AI 설정 및 프롬프트 환경 파일
 ┣ 📂 .venv/         # 가상 환경 (Virtual Environment)
 ┣ 📂 auth/          # JWT 토큰 생성, 검증 및 사용자 권한 관리
 ┣ 📂 data/          # 원본/전처리 데이터 및 외부 데이터 수집 스크립트
 ┣ 📂 database/      # DB 세션 연결 설정 및 SQLAlchemy ORM 모델 정의
 ┣ 📂 ml/            # 모델 개발 노트북 (baseline.ipynb, ensemble.ipynb 등)
 ┣ 📂 models/        # 직렬화된 ML 모델 파일 또는 관련 에셋 저장소
 ┣ 📂 models_pkl/    # 피클(.pkl) 형태의 로컬 모델 저장소
 ┣ 📂 routers/       # API 엔드포인트 분리 (predict, analytics, driver, user 등)
 ┣ 📂 schema/        # Pydantic 기반 API 요청/응답 데이터 검증 모델
 ┣ 📂 serving/       # MLflow 연동 추론 모듈 및 자동화 scheduler.py
 ┣ 📂 static/        # 프론트엔드 정적 파일 (HTML, CSS, JS, Bootstrap 연동)
 ┣ 📜 .env           # 환경변수 파일 (DB, Supabase, JWT 키 등 보안 설정)
 ┣ 📜 .gitignore     # Git 버전 관리 제외 목록
 ┣ 📜 main.py        # FastAPI 애플리케이션 진입점 (Lifespan 설정 포함)
 ┣ 📜 mlflow.db      # MLflow 실험 및 튜닝 이력 트래킹 로컬 DB
 ┣ 📜 README.md      # 프로젝트 설명서 (현재 파일)
 ┗ 📜 requirements.txt # Python 패키지 의존성 목록
```

---

## 5. 🚀 설치 및 실행 방법 (Getting Started)

### 1) 의존성 라이브러리 설치
```bash
pip install -r requirements.txt
```

### 2) 환경 변수 설정
프로젝트 최상위 경로에 `.env` 파일을 생성하고 아래와 같은 필수 환경 변수를 입력합니다. (예시는 `.env.example` 참고)
```env
# Database
DB_URL="mysql+pymysql://user:password@localhost:3306/dbname"

# Security
SECRET_KEY="your_jwt_secret_key"

# MLOps
MLFLOW_TRACKING_URI="http://localhost:5000"

# Supabase
SUPABASE_URL="your_supabase_project_url"
SUPABASE_KEY="your_supabase_api_key"
```

### 3) FastAPI 서버 실행
```bash
uvicorn main:app --reload
```
서버가 정상적으로 실행되면 `http://localhost:8000` 에서 웹 서비스에 접속할 수 있습니다.

---

## 6. 📖 API 문서 (API Documentation)
FastAPI의 자동 생성 문서를 통해 상세한 API 스펙을 확인하고 테스트할 수 있습니다. 로컬 서버 실행 후 아래 주소로 접속하세요.
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

---

## 7. 🧠 데이터 및 모델링 (Data & Modeling)
- **실험 및 개발:** `ml/` 폴더 내 노트북 파일을 통해 베이스라인 모델 구축부터 앙상블 기법까지의 개발 과정을 확인할 수 있습니다.
- **모델 서빙:** 학습이 완료된 챔피언 모델은 **MLflow 모델 레지스트리**에 등록되며, `serving/` 모듈을 통해 API 호출 시 실시간으로 로드되어 추론을 수행합니다. `models_pkl/` 디렉토리를 활용하여 캐싱된 로컬 모델도 관리합니다.

---

## 8. 📜 라이선스 및 기여 (License)
본 프로젝트는 교육 및 포트폴리오 목적으로 개발되었습니다. 프로젝트 기여 및 버그 리포트는 Issue나 Pull Request를 통해 남겨주시기 바랍니다.