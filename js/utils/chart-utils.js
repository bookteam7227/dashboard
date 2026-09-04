import {
    calculateChangeRate,
    formatNumber,
    formatSignedValue,
    getComparisonClass
} from "./number-utils.js";
import { formatFullDate } from "./date-utils.js";

export const CURRENT_COLOR = "#ef3340";
export const PREVIOUS_COLOR = "#1d4ed8";

function getOrCreateTooltip(chart) {
    const container = chart.canvas.parentNode;
    let element = container.querySelector(".chart-tooltip");
    if (!element) {
        element = document.createElement("div");
        element.className = "chart-tooltip";
        container.appendChild(element);
    }
    return element;
}

function renderComparisonTooltip(context, unit) {
    const { chart, tooltip } = context;
    const element = getOrCreateTooltip(chart);
    if (!tooltip.opacity || !tooltip.dataPoints?.length) {
        element.style.opacity = 0;
        return;
    }

    const comparison = chart.comparisonRows?.[tooltip.dataPoints[0].dataIndex];
    if (!comparison) {
        element.style.opacity = 0;
        return;
    }

    const change = comparison.currentValue - comparison.previousValue;
    const rate = calculateChangeRate(comparison.currentValue, comparison.previousValue);
    element.innerHTML = `
        <div class="tooltip-title">
            ${formatFullDate(comparison.currentDate)} / 전년 ${formatFullDate(comparison.previousDate)}
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">금년</span>
            <span class="tooltip-value tooltip-current">${formatNumber(comparison.currentValue)}${unit}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">전년</span>
            <span class="tooltip-value tooltip-previous">${formatNumber(comparison.previousValue)}${unit}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">증감</span>
            <span class="tooltip-value ${getComparisonClass(change)}">${formatSignedValue(change, unit)}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">증감률</span>
            <span class="tooltip-value ${rate.className}">${rate.text}</span>
        </div>
    `;

    const canvasBox = chart.canvas.getBoundingClientRect();
    const containerBox = chart.canvas.parentNode.getBoundingClientRect();
    let left = canvasBox.left - containerBox.left + tooltip.caretX;
    const top = canvasBox.top - containerBox.top + tooltip.caretY;
    const halfWidth = (element.offsetWidth || 220) / 2;
    left = Math.max(halfWidth + 8, Math.min(left, containerBox.width - halfWidth - 8));
    element.style.opacity = 1;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

export function createComparisonChart(canvas, rows, unit, labelFormatter) {
    const chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: rows.map((row) => labelFormatter(row.currentDate)),
            datasets: [
                {
                    label: "금년",
                    data: rows.map((row) => row.currentValue),
                    borderColor: CURRENT_COLOR,
                    backgroundColor: CURRENT_COLOR,
                    borderWidth: 2.5,
                    pointRadius: 1.5,
                    pointHoverRadius: 5,
                    pointBorderWidth: 0,
                    tension: 0.25,
                    fill: false
                },
                {
                    label: "전년 동기간",
                    data: rows.map((row) => row.previousValue),
                    borderColor: PREVIOUS_COLOR,
                    backgroundColor: PREVIOUS_COLOR,
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 5,
                    pointBorderWidth: 0,
                    tension: 0.25,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            layout: { padding: { top: 5, right: 8, bottom: 0, left: 2 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: (context) => renderComparisonTooltip(context, unit)
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: "#76839a",
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 20
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "#edf1f5" },
                    ticks: {
                        color: "#76839a",
                        font: { size: 9 },
                        callback: (value) => formatNumber(value)
                    }
                }
            }
        }
    });
    chart.comparisonRows = rows;
    return chart;
}

const YEAR_COLORS = [
    "#ef3340", "#1d4ed8", "#16a34a", "#9333ea", "#f59e0b",
    "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#ea580c",
    "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#15803d",
    "#a16207", "#6d28d9", "#c2410c", "#0e7490", "#4338ca",
    "#b91c1c", "#047857", "#7e22ce", "#1e40af"
];

export function createAnnualChart(canvas, yearlyData) {
    const years = Array.from(yearlyData.keys()).sort((a, b) => b - a);
    const datasets = years.map((year, index) => ({
        label: `${year}년`,
        data: yearlyData.get(year),
        borderColor: YEAR_COLORS[index % YEAR_COLORS.length],
        backgroundColor: YEAR_COLORS[index % YEAR_COLORS.length],
        borderWidth: index === 0 ? 3 : 1.8,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: false
    }));

    return new Chart(canvas, {
        type: "line",
        data: {
            labels: Array.from({ length: 12 }, (_, index) => `${index + 1}월`),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: "right",
                    labels: {
                        color: "#5f6f84",
                        boxWidth: 18,
                        boxHeight: 3,
                        padding: 9,
                        font: { size: 9, weight: "bold" }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y)}건`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#76839a", font: { size: 9 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "#edf1f5" },
                    ticks: {
                        color: "#76839a",
                        font: { size: 9 },
                        callback: (value) => formatNumber(value)
                    }
                }
            }
        }
    });
}
