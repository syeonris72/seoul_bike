def classify_stock_level(total: int, capacity: int) -> str:
    """대여소 재고 상태(과포화/고갈/부족/적정)를 정원 대비 비율로 판정한다.

    이전 버전(mock-data.js의 classifyStockLevel을 그대로 포팅한 것)은 과포화만
    비율(90%) 기준이고 고갈/부족은 절대 대수(<=1대/<=3대) 기준이라 정원이 큰
    대여소는 실제로 거의 비어 있어도(예: 정원 50에 5대 = 10%) "적정"으로,
    정원이 작은 대여소는 꽤 차 있어도(예: 정원 5에 3대 = 60%) "부족"으로
    잘못 판정되는 문제가 있었다. 네 등급 모두 정원 대비 비율로 통일한다."""
    if capacity <= 0:
        return "적정"
    pct = total / capacity
    if pct >= 0.9:
        return "과포화"
    if total == 0 or pct <= 0.1:
        return "고갈"
    if pct <= 0.3:
        return "부족"
    return "적정"
