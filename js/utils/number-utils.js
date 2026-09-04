const numberFormatter = new Intl.NumberFormat("ko-KR");

export function getNumber(value) {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : 0;
}

export function formatNumber(value) {
    return numberFormatter.format(getNumber(value));
}

export function getComparisonClass(value) {
    if (value > 0) {
        return "tooltip-positive";
    }
    if (value < 0) {
        return "tooltip-negative";
    }
    return "tooltip-neutral";
}

export function formatSignedValue(value, unit) {
    const numeric = getNumber(value);
    return `${numeric > 0 ? "+" : ""}${formatNumber(numeric)}${unit}`;
}

export function calculateChangeRate(currentValue, previousValue) {
    if (previousValue === 0) {
        return currentValue === 0
            ? { text: "0.0%", className: "tooltip-neutral" }
            : { text: "산정 불가", className: "tooltip-neutral" };
    }

    const rate = ((currentValue - previousValue) / previousValue) * 100;
    return {
        text: `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`,
        className: getComparisonClass(rate)
    };
}
