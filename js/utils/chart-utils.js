// /js/utils/chart-utils.js

import {
    calculateChangeRate,
    formatNumber,
    formatSignedValue,
    getComparisonClass,
    getNumber
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

    const comparison =
        chart.comparisonRows?.[tooltip.dataPoints[0].dataIndex];

    if (!comparison) {
        element.style.opacity = 0;
        return;
    }

    const change =
        comparison.currentValue -
        comparison.previousValue;

    const rate = calculateChangeRate(
        comparison.currentValue,
        comparison.previousValue
    );

    element.innerHTML = `
        <div class="tooltip-title">
            ${formatFullDate(comparison.currentDate)} / 전년 ${formatFullDate(comparison.previousDate)}
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">금년</span>
            <span class="tooltip-value tooltip-current">
                ${formatNumber(comparison.currentValue)}${unit}
            </span>
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">전년</span>
            <span class="tooltip-value tooltip-previous">
                ${formatNumber(comparison.previousValue)}${unit}
            </span>
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">증감</span>
            <span class="tooltip-value ${getComparisonClass(change)}">
                ${formatSignedValue(change, unit)}
            </span>
        </div>

        <div class="tooltip-row">
            <span class="tooltip-label">증감률</span>
            <span class="tooltip-value ${rate.className}">
                ${rate.text}
            </span>
        </div>
    `;

    const canvasBox =
        chart.canvas.getBoundingClientRect();

    const containerBox =
        chart.canvas.parentNode.getBoundingClientRect();

    const cursorX =
        canvasBox.left -
        containerBox.left +
        tooltip.caretX;

    const top =
        canvasBox.top -
        containerBox.top +
        tooltip.caretY;

    const halfWidth =
        (element.offsetWidth || 220) / 2;

    const horizontalOffset = 30;

    let left =
        cursorX +
        halfWidth +
        horizontalOffset;

    if (
        left + halfWidth + 8 >
        containerBox.width
    ) {
        left =
            cursorX -
            halfWidth -
            horizontalOffset;
    }

    left = Math.max(
        halfWidth + 8,
        Math.min(
            left,
            containerBox.width - halfWidth - 8
        )
    );

    element.style.opacity = 1;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

export function createComparisonChart(
    canvas,
    rows,
    unit,
    labelFormatter
) {
    const chart = new Chart(canvas, {
        type: "line",

        data: {
            labels: rows.map(
                (row) =>
                    labelFormatter(row.currentDate)
            ),

            datasets: [
                {
                    label: "금년",
                    data: rows.map(
                        (row) => row.currentValue
                    ),
                    borderColor: CURRENT_COLOR,
                    backgroundColor: CURRENT_COLOR,
                    borderWidth: 3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBorderWidth: 0,
                    tension: 0,
                    fill: false
                },
                {
                    label: "전년 동기간",
                    data: rows.map(
                        (row) => row.previousValue
                    ),
                    borderColor: PREVIOUS_COLOR,
                    backgroundColor: PREVIOUS_COLOR,
                    borderWidth: 1.8,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBorderWidth: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            layout: {
                padding: {
                    top: 5,
                    right: 8,
                    bottom: 0,
                    left: 2
                }
            },

            plugins: {
                legend: {
                    display: true,
                    position: "right",

                    labels: {
                        color: "#5f6f84",
                        boxWidth: 18,
                        boxHeight: 3,
                        padding: 9,

                        font: {
                            size: 9,
                            weight: "bold"
                        }
                    }
                },

                tooltip: {
                    enabled: false,
                    external: (context) =>
                        renderComparisonTooltip(
                            context,
                            unit
                        )
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9
                        },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 20
                    }
                },

                y: {
                    beginAtZero: true,

                    grid: {
                        color: "#edf1f5"
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9
                        },
                        callback: (value) =>
                            formatNumber(value)
                    }
                }
            }
        }
    });

    chart.comparisonRows = rows;

    return chart;
}

const YEAR_COLORS = [
    "#ef3340",
    "#1d4ed8",
    "#16a34a",
    "#9333ea",
    "#f59e0b",
    "#0891b2",
    "#db2777",
    "#4f46e5",
    "#65a30d",
    "#ea580c",
    "#0f766e",
    "#7c3aed",
    "#be123c",
    "#0369a1",
    "#15803d",
    "#a16207",
    "#6d28d9",
    "#c2410c",
    "#0e7490",
    "#4338ca",
    "#b91c1c",
    "#047857",
    "#7e22ce",
    "#1e40af"
];


function getAnnualDatasetYear(dataset) {
    const match =
        /^(\d{4})년$/.exec(
            String(
                dataset && dataset.label
                    ? dataset.label
                    : ""
            )
        );

    return match
        ? Number(match[1])
        : null;
}

function renderAnnualComparisonTooltip(
    context,
    yearlyData,
    unit
) {
    const { chart, tooltip } =
        context;

    const element =
        getOrCreateTooltip(chart);

    if (
        !tooltip.opacity
        || !tooltip.dataPoints?.length
    ) {
        element.style.opacity = 0;
        return;
    }

    const dataIndex =
        tooltip.dataPoints[0].dataIndex;

    const monthLabel =
        (
            chart.data.labels
            && chart.data.labels[dataIndex]
        )
        || `${dataIndex + 1}월`;

    const rowHtml =
        tooltip.dataPoints.map(
            (dataPoint) => {
                const dataset =
                    chart.data.datasets[
                        dataPoint.datasetIndex
                    ];

                const year =
                    getAnnualDatasetYear(
                        dataset
                    );

                const currentValue =
                    getNumber(
                        dataPoint.parsed
                            ? dataPoint.parsed.y
                            : 0
                    );

                const previousValues =
                    year !== null
                        ? yearlyData.get(
                            year - 1
                        )
                        : null;

                const previousRaw =
                    previousValues
                        ? previousValues[
                            dataIndex
                        ]
                        : null;

                const hasPrevious =
                    previousRaw !== null
                    && previousRaw !== undefined;

                const previousValue =
                    hasPrevious
                        ? getNumber(previousRaw)
                        : null;

                const change =
                    hasPrevious
                        ? currentValue
                            - previousValue
                        : null;

                const rate =
                    hasPrevious
                        ? calculateChangeRate(
                            currentValue,
                            previousValue
                        )
                        : null;

                const changeClass =
                    change === null
                        ? "tooltip-neutral"
                        : getComparisonClass(
                            change
                        );

                const rateClass =
                    (
                        rate
                        && rate.className
                    )
                    || "tooltip-neutral";

                const previousText =
                    hasPrevious
                        ? `${formatNumber(
                            previousValue
                        )}${unit}`
                        : "-";

                const changeText =
                    change === null
                        ? "-"
                        : formatSignedValue(
                            change,
                            unit
                        );

                const rateText =
                    (
                        rate
                        && rate.text
                    )
                    || "-";

                return `
                    <div class="tooltip-annual-group">
                        <div class="tooltip-row">
                            <span class="tooltip-label">
                                ${dataset.label}
                            </span>

                            <span class="tooltip-value">
                                ${formatNumber(
                                    currentValue
                                )}${unit}
                            </span>
                        </div>

                        <div class="tooltip-row">
                            <span class="tooltip-label">
                                전년
                            </span>

                            <span class="tooltip-value tooltip-previous">
                                ${previousText}
                            </span>
                        </div>

                        <div class="tooltip-row">
                            <span class="tooltip-label">
                                전년대비 증감
                            </span>

                            <span class="tooltip-value ${changeClass}">
                                ${changeText}
                            </span>
                        </div>

                        <div class="tooltip-row">
                            <span class="tooltip-label">
                                전년대비 증감률
                            </span>

                            <span class="tooltip-value ${rateClass}">
                                ${rateText}
                            </span>
                        </div>
                    </div>
                `;
            }
        ).join("");

    element.innerHTML = `
        <div class="tooltip-title">
            ${monthLabel}
        </div>

        ${rowHtml}
    `;

    const canvasBox =
        chart.canvas.getBoundingClientRect();

    const containerBox =
        chart.canvas.parentNode
            .getBoundingClientRect();

    const cursorX =
        canvasBox.left
        - containerBox.left
        + tooltip.caretX;

    const top =
        canvasBox.top
        - containerBox.top
        + tooltip.caretY;

    const halfWidth =
        (element.offsetWidth || 220) / 2;

    const horizontalOffset = 30;

    let left =
        cursorX
        + halfWidth
        + horizontalOffset;

    if (
        left + halfWidth + 8
        > containerBox.width
    ) {
        left =
            cursorX
            - halfWidth
            - horizontalOffset;
    }

    left = Math.max(
        halfWidth + 8,
        Math.min(
            left,
            containerBox.width
            - halfWidth
            - 8
        )
    );

    const halfHeight =
        (element.offsetHeight || 180) / 2;

    const clampedTop =
        Math.max(
            halfHeight + 8,
            Math.min(
                top,
                containerBox.height
                - halfHeight
                - 8
            )
        );

    element.style.opacity = 1;
    element.style.left = `${left}px`;
    element.style.top = `${clampedTop}px`;
}

export function createAnnualChart(
    canvas,
    yearlyData,
    unit = "건"
) {
    const years =
        Array.from(yearlyData.keys())
            .sort((a, b) => b - a);

    const datasets =
        years.map((year, index) => ({
            label: `${year}년`,
            data: yearlyData.get(year),
            borderColor:
                YEAR_COLORS[
                    index % YEAR_COLORS.length
                ],
            backgroundColor:
                YEAR_COLORS[
                    index % YEAR_COLORS.length
                ],
            borderWidth:
                index === 0 ? 3 : 1.8,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0,
            fill: false
        }));

    return new Chart(canvas, {
        type: "line",

        data: {
            labels:
                Array.from(
                    { length: 12 },
                    (_, index) =>
                        `${index + 1}월`
                ),
            datasets
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    display: true,
                    position: "right",

                    labels: {
                        color: "#5f6f84",
                        boxWidth: 18,
                        boxHeight: 3,
                        padding: 9,

                        font: {
                            size: 9,
                            weight: "bold"
                        }
                    }
                },

                tooltip: {
                    enabled: false,
                    external: (context) =>
                        renderAnnualComparisonTooltip(
                            context,
                            yearlyData,
                            unit
                        )
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9
                        }
                    }
                },

                y: {
                    beginAtZero: true,

                    grid: {
                        color: "#edf1f5"
                    },

                    ticks: {
                        color: "#76839a",
                        font: {
                            size: 9
                        },
                        callback: (value) =>
                            formatNumber(value)
                    }
                }
            }
        }
    });
}
