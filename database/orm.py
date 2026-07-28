from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0의 Declarative Mapping을 위한 기본 클래스
    모든 데이터베이스 모델 클래스는 이 Base를 상속받아 정의함
    """
    pass