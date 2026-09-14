// /js/pages/monthly-statistics.js

import {
    getDocumentRow,
    getCollectionRowsByDocumentIdRange
} from "../services/firestore-service.js";
import {
    calculateChangeRate,
    formatNumber,
    getComparisonClass,
    getNumber
} from "../utils/number-utils.js";
import {
    createAnnualChart
} from "../utils/chart-utils.js";

export const title = "월별 통계";

const ANNUAL_YEARS = 5;

const REQUIRED_COLLECTIONS = [
    "dispatch",
    "shipping",
    "courier",
    "resend",
    "partTime",
    "bookstoreOutsourcing",
    "lectureUnistudyOutsourcing",
    "otherCosts"
];

const COLLECTIONS = {
    dispatch: {
        monthly: "monthly_dispatch_summary",
        yearly: "yearly_dispatch_summary"
    },
    shipping: {
        monthly: "monthly_shipping_summary",
        yearly: "yearly_shipping_summary"
    },
    courier: {
        monthly: "monthly_courier_statistics",
        yearly: "yearly_courier_statistics"
    },
    resend: {
        monthly: "monthly_resend_refund_metrics",
        yearly: "yearly_resend_refund_metrics"
    },
    partTime: {
        monthly: "monthly_part_time_labor",
        yearly: "yearly_part_time_labor"
    },
    bookstoreOutsourcing: {
        monthly: "monthly_bookstore_outsourcing",
        yearly: "yearly_bookstore_outsourcing"
    },
    lectureUnistudyOutsourcing: {
        monthly: "monthly_lecture_unistudy_outsourcing",
        yearly: "yearly_lecture_unistudy_outsourcing"
    },
    otherCosts: {
        monthly: "monthly_other_costs",
        yearly: "yearly_other_costs"
    }
};

const SUM_FIELDS = {
    dispatch: [
        "net_sales_books",
        "net_sales_amount",
        "premium_megapass_amount",
        "textbook_sales_amount",
        "actual_payment_amount",
        "free_sales_excluding_premium_pass"
    ],
    shipping: [
        "shipping_fee_amount"
    ],
    courier: [
        "total_qty",
        "normal_shipping_orders",
        "normal_shipping_amount",
        "return_orders",
        "return_amount",
        "event_orders",
        "event_amount",
        "other_rate_orders",
        "other_rate_amount",
        "courier_amount"
    ],
    resend: [
        "total_shipping_orders",
        "resend_orders",
        "textbook_sales_amount",
        "textbook_refund_amount",
        "actual_shipping_orders",
        "actual_shipping_books"
    ],
    partTime: [
        "total_workers",
        "total_cost"
    ],
    bookstoreOutsourcing: [
        "total_qty",
        "courier_cost_amount",
        "courier_fee_support_amount",
        "logistics_cost_amount"
    ],
    lectureUnistudyOutsourcing: [
        "lecture_orders",
        "lecture_logistics_cost_amount",
        "lecture_courier_cost_amount",
        "unistudy_orders",
        "unistudy_logistics_cost_amount",
        "unistudy_courier_cost_amount"
    ],
    otherCosts: [
        "total_amount",
        "telecommunication_amount",
        "electricity_amount",
        "water_amount",
        "building_rent_amount",
        "quick_service_amount",
        "envelope_production_amount",
        "other_rent_amount",
        "snack_amount",
        "dinner_and_weekend_meal_amount",
        "operating_amount",
        "part_time_lunch_amount",
        "water_purifier_rental_amount",
        "shuttle_bus_amount"
    ]
};

const TABLES = [
    {
        title: "교재팀 수익금",
        columns: [
            valueColumn("교재매출|(유료+무료)", (d) =>
                getField(d, "dispatch", "net_sales_amount")
            ),
            valueColumn("교재매출(유료)", (d) =>
                getField(d, "dispatch", "textbook_sales_amount")
            ),
            valueColumn("프리미엄 메가패스", (d) =>
                getField(d, "dispatch", "premium_megapass_amount")
            ),
            valueColumn("교재매출(무료)", (d) =>
                getField(
                    d,
                    "dispatch",
                    "free_sales_excluding_premium_pass"
                )
            ),
            valueColumn("교재 지급금", (d) =>
                getField(d, "dispatch", "actual_payment_amount")
            ),
            valueColumn("배송비 매출", (d) =>
                getField(d, "shipping", "shipping_fee_amount")
            ),
            valueColumn(
                "배송비 지급금|(교재팀+외주)",
                getCourierPayment
            ),
            valueColumn("외주 물류비용", getOutsourcingLogisticsCost),
            valueColumn("기타 비용", (d) =>
                getField(d, "otherCosts", "total_amount")
            ),
            valueColumn(
                "교재팀 수익금",
                getTextbookTeamProfit,
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "교재 매출",
        columns: [
            valueColumn(
                "판매 권수",
                (d) =>
                    getField(d, "dispatch", "net_sales_books"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "교재 매출",
                (d) =>
                    getField(d, "dispatch", "textbook_sales_amount"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "교재 지급금",
                (d) =>
                    getField(d, "dispatch", "actual_payment_amount"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "무료 매출",
                (d) =>
                    getField(
                        d,
                        "dispatch",
                        "free_sales_excluding_premium_pass"
                    ),
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "택배 매출",
        columns: [
            valueColumn(
                "배송비 매출",
                (d) =>
                    getField(d, "shipping", "shipping_fee_amount"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "택배사 총 지급액",
                getCourierPayment,
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "택배 발송건수",
        columns: [
            valueColumn("택배발송 총 건수", getTotalCourierOrders),
            valueColumn(
                "택배발송 총 비용",
                getCourierPayment,
                {
                    includeDiff: true
                }
            ),
            valueColumn("정상발송 건수", getNormalCourierOrders),
            valueColumn(
                "정상발송 비용",
                getNormalCourierCost,
                {
                    includeDiff: true
                }
            ),
            valueColumn("이벤트+반송 건수", (d) =>
                getField(d, "courier", "return_orders")
                + getField(d, "courier", "event_orders")
            ),
            valueColumn(
                "이벤트+반송 비용",
                (d) =>
                    getField(d, "courier", "return_amount")
                    + getField(d, "courier", "event_amount"),
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "교재 재발송/환불/주문 건당 교재권수",
        columns: [
            valueColumn("재발송 총 건수", (d) =>
                getField(d, "resend", "resend_orders")
            ),
            valueColumn(
                "재발송 비율",
                (d) =>
                    safeDivide(
                        getField(d, "resend", "resend_orders"),
                        getField(d, "resend", "total_shipping_orders")
                    ),
                {
                    format: "percent",
                    includeDiff: true
                }
            ),
            valueColumn("교재 환불 금액", (d) =>
                getField(d, "resend", "textbook_refund_amount")
            ),
            valueColumn(
                "교재 환불 비율",
                (d) =>
                    safeDivide(
                        getField(d, "resend", "textbook_refund_amount"),
                        getField(d, "resend", "textbook_sales_amount")
                    ),
                {
                    format: "percent",
                    includeDiff: true
                }
            ),
            valueColumn(
                "주문당 평균 권수",
                (d) =>
                    safeDivide(
                        getField(d, "resend", "actual_shipping_books"),
                        getField(d, "resend", "actual_shipping_orders")
                    ),
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "아르바이트 통계",
        columns: [
            valueColumn(
                "총 인원",
                (d) =>
                    getField(d, "partTime", "total_workers"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "총 비용",
                (d) =>
                    getField(d, "partTime", "total_cost"),
                {
                    includeDiff: true
                }
            ),
            valueColumn(
                "월 평균 인원",
                (d, row) =>
                    safeDivide(
                        getField(d, "partTime", "total_workers"),
                        row.monthDivisor
                    )
            ),
            valueColumn(
                "월 평균 비용",
                (d, row) =>
                    safeDivide(
                        getField(d, "partTime", "total_cost"),
                        row.monthDivisor
                    )
            )
        ]
    },
    {
        title: "기타 비용_1",
        columns: [
            valueColumn("통신비", (d) =>
                getField(d, "otherCosts", "telecommunication_amount")
            ),
            valueColumn("전기요금", (d) =>
                getField(d, "otherCosts", "electricity_amount")
            ),
            valueColumn("수도요금", (d) =>
                getField(d, "otherCosts", "water_amount")
            ),
            valueColumn("건물 임대료", (d) =>
                getField(d, "otherCosts", "building_rent_amount")
            ),
            valueColumn(
                "합계",
                (d) =>
                    getField(d, "otherCosts", "telecommunication_amount")
                    + getField(d, "otherCosts", "electricity_amount")
                    + getField(d, "otherCosts", "water_amount")
                    + getField(d, "otherCosts", "building_rent_amount"),
                {
                    includeDiff: true
                }
            )
        ]
    },
    {
        title: "기타 비용_2",
        columns: [
            valueColumn("퀵 서비스", (d) =>
                getField(d, "otherCosts", "quick_service_amount")
            ),
            valueColumn("포장재료|제작비", (d) =>
                getField(d, "otherCosts", "envelope_production_amount")
            ),
            valueColumn("기타 임대료|(지게차, 외부창고)", (d) =>
                getField(d, "otherCosts", "other_rent_amount")
            ),
            valueColumn("간식비", (d) =>
                getField(d, "otherCosts", "snack_amount")
            ),
            valueColumn("식비|(석식&주말)", (d) =>
                getField(
                    d,
                    "otherCosts",
                    "dinner_and_weekend_meal_amount"
                )
            ),
            valueColumn("운영비", (d) =>
                getField(d, "otherCosts", "operating_amount")
            ),
            valueColumn("아르바이트|중식비", (d) =>
                getField(d, "otherCosts", "part_time_lunch_amount")
            ),
            valueColumn("정수기 렌탈비", (d) =>
                getField(
                    d,
                    "otherCosts",
                    "water_purifier_rental_amount"
                )
            ),
            valueColumn("셔틀버스|운행비용", (d) =>
                getField(d, "otherCosts", "shuttle_bus_amount")
            ),
            valueColumn(
                "합계",
                (d) =>
                    getField(d, "otherCosts", "total_amount"),
                {
                    includeDiff: true
                }
            )
        ]
    }
];

let active = false;
let salesChart = null;
let courierComparisonChart = null;

function valueColumn(
    label,
    getter,
    options = {}
) {
    return {
        label,
        getter,
        format:
            options.format || "number",
        includeDiff:
            Boolean(options.includeDiff)
    };
}

function safeDivide(
    numerator,
    denominator
) {
    const safeNumerator =
        getNumber(numerator);

    const safeDenominator =
        getNumber(denominator);

    if (safeDenominator === 0) {
        return 0;
    }

    return (
        safeNumerator
        / safeDenominator
    );
}

function getField(
    dataset,
    collectionKey,
    fieldName
) {
    return getNumber(
        dataset?.[collectionKey]?.[fieldName]
    );
}

function getCourierPayment(dataset) {
    return (
        getField(
            dataset,
            "courier",
            "courier_amount"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "courier_cost_amount"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "courier_fee_support_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "lecture_courier_cost_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "unistudy_courier_cost_amount"
        )
    );
}

function getOutsourcingLogisticsCost(dataset) {
    return (
        getField(
            dataset,
            "bookstoreOutsourcing",
            "logistics_cost_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "lecture_logistics_cost_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "unistudy_logistics_cost_amount"
        )
    );
}

function getTextbookTeamProfit(dataset) {
    return (
        getField(
            dataset,
            "dispatch",
            "textbook_sales_amount"
        )
        - getField(
            dataset,
            "dispatch",
            "actual_payment_amount"
        )
        + getField(
            dataset,
            "shipping",
            "shipping_fee_amount"
        )
        - getCourierPayment(dataset)
        - getOutsourcingLogisticsCost(dataset)
        - getField(
            dataset,
            "otherCosts",
            "total_amount"
        )
    );
}

function getTotalCourierOrders(dataset) {
    return (
        getField(
            dataset,
            "courier",
            "total_qty"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "total_qty"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "lecture_orders"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "unistudy_orders"
        )
    );
}

function getNormalCourierOrders(dataset) {
    return (
        getField(
            dataset,
            "courier",
            "normal_shipping_orders"
        )
        + getField(
            dataset,
            "courier",
            "other_rate_orders"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "total_qty"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "lecture_orders"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "unistudy_orders"
        )
    );
}

function getNormalCourierCost(dataset) {
    return (
        getField(
            dataset,
            "courier",
            "normal_shipping_amount"
        )
        + getField(
            dataset,
            "courier",
            "other_rate_amount"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "courier_cost_amount"
        )
        + getField(
            dataset,
            "bookstoreOutsourcing",
            "courier_fee_support_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "lecture_courier_cost_amount"
        )
        + getField(
            dataset,
            "lectureUnistudyOutsourcing",
            "unistudy_courier_cost_amount"
        )
    );
}

function destroyCharts() {
    salesChart?.destroy();
    courierComparisonChart?.destroy();

    salesChart = null;
    courierComparisonChart = null;
}

function emptyAggregate(collectionKey) {
    const result = {};

    SUM_FIELDS[collectionKey]
        .forEach((fieldName) => {
            result[fieldName] = 0;
        });

    return result;
}

function sumRows(
    collectionKey,
    rows
) {
    const result =
        emptyAggregate(collectionKey);

    rows.forEach((row) => {
        SUM_FIELDS[collectionKey]
            .forEach((fieldName) => {
                result[fieldName] +=
                    getNumber(
                        row[fieldName]
                    );
            });
    });

    return result;
}

function subtractRows(
    collectionKey,
    fullYear,
    excludedRows
) {
    const result =
        emptyAggregate(collectionKey);

    SUM_FIELDS[collectionKey]
        .forEach((fieldName) => {
            result[fieldName] =
                getNumber(
                    fullYear?.[fieldName]
                );
        });

    excludedRows.forEach((row) => {
        SUM_FIELDS[collectionKey]
            .forEach((fieldName) => {
                result[fieldName] -=
                    getNumber(
                        row[fieldName]
                    );
            });
    });

    return result;
}

async function findCurrentDataMonth(
    currentYear
) {
    const collectionName =
        COLLECTIONS.dispatch.monthly;

    const currentMonth =
        new Date().getMonth() + 1;

    for (
        let month = currentMonth;
        month >= 1;
        month -= 1
    ) {
        const documentId =
            `${currentYear}-${String(
                month
            ).padStart(2, "0")}`;

        const row =
            await getDocumentRow(
                collectionName,
                documentId
            );

        if (row) {
            return month;
        }
    }

    return 0;
}

async function loadYearlyCollections(
    firstYear,
    currentYear
) {
    const result = {};

    await Promise.all(
        REQUIRED_COLLECTIONS.map(
            async (collectionKey) => {
                const collectionName =
                    COLLECTIONS[
                        collectionKey
                    ].yearly;

                const rows =
                    await getCollectionRowsByDocumentIdRange(
                        collectionName,
                        String(firstYear),
                        String(currentYear)
                    );

                result[collectionKey] =
                    new Map(
                        rows.map(
                            (row) => [
                                Number(
                                    row.base_year
                                    || row.id
                                ),
                                row
                            ]
                        )
                    );
            }
        )
    );

    return result;
}

function yearlyDatasetForYear(
    yearlyCollections,
    year
) {
    const result = {};

    REQUIRED_COLLECTIONS
        .forEach((collectionKey) => {
            result[collectionKey] =
                yearlyCollections[
                    collectionKey
                ]?.get(year)
                || {};
        });

    return result;
}

async function loadPreviousYearYtd(
    yearlyCollections,
    previousYear,
    cutoffMonth
) {
    const result = {};

    if (cutoffMonth <= 0) {
        REQUIRED_COLLECTIONS
            .forEach((collectionKey) => {
                result[collectionKey] = {};
            });

        return result;
    }

    const useFrontRange =
        cutoffMonth <= 6;

    await Promise.all(
        REQUIRED_COLLECTIONS.map(
            async (collectionKey) => {
                const monthlyCollection =
                    COLLECTIONS[
                        collectionKey
                    ].monthly;

                if (useFrontRange) {
                    const rows =
                        await getCollectionRowsByDocumentIdRange(
                            monthlyCollection,
                            `${previousYear}-01`,
                            `${previousYear}-${String(
                                cutoffMonth
                            ).padStart(2, "0")}`
                        );

                    result[collectionKey] =
                        sumRows(
                            collectionKey,
                            rows
                        );

                    return;
                }

                if (cutoffMonth >= 12) {
                    result[collectionKey] =
                        yearlyCollections[
                            collectionKey
                        ]?.get(
                            previousYear
                        )
                        || {};

                    return;
                }

                const excludedRows =
                    await getCollectionRowsByDocumentIdRange(
                        monthlyCollection,
                        `${previousYear}-${String(
                            cutoffMonth + 1
                        ).padStart(2, "0")}`,
                        `${previousYear}-12`
                    );

                result[collectionKey] =
                    subtractRows(
                        collectionKey,
                        yearlyCollections[
                            collectionKey
                        ]?.get(
                            previousYear
                        ),
                        excludedRows
                    );
            }
        )
    );

    return result;
}

function createRows(
    yearlyCollections,
    firstYear,
    currentYear,
    cutoffMonth,
    previousYtd
) {
    const rows = [];

    for (
        let year = firstYear;
        year <= currentYear - 1;
        year += 1
    ) {
        rows.push({
            label: `${year}년`,
            year,
            type: "year",
            monthDivisor: 12,
            dataset:
                yearlyDatasetForYear(
                    yearlyCollections,
                    year
                )
        });
    }

    if (cutoffMonth > 0) {
        rows.push({
            label:
                `전년 ${cutoffMonth}월까지`,
            year:
                currentYear - 1,
            type: "previousYtd",
            monthDivisor:
                cutoffMonth,
            dataset:
                previousYtd
        });

        rows.push({
            label:
                `금년 ${cutoffMonth}월까지`,
            year:
                currentYear,
            type: "currentYtd",
            monthDivisor:
                cutoffMonth,
            dataset:
                yearlyDatasetForYear(
                    yearlyCollections,
                    currentYear
                )
        });
    }

    return rows;
}

function formatValue(
    value,
    format
) {
    if (format === "percent") {
        return `${
            (
                getNumber(value)
                * 100
            ).toFixed(1)
        }%`;
    }

    return formatNumber(value);
}

function diffInfo(
    current,
    previous,
    format
) {
    if (format === "percent") {
        const pointDifference =
            (
                getNumber(current)
                - getNumber(previous)
            ) * 100;

        return {
            text:
                `${Math.abs(
                    pointDifference
                ).toFixed(1)}%p ${
                    pointDifference >= 0
                        ? "▲"
                        : "▼"
                }`,
            className:
                getComparisonClass(
                    pointDifference
                )
        };
    }

    const rate =
        calculateChangeRate(
            getNumber(current),
            getNumber(previous)
        );

    const numericRate =
        (
            getNumber(previous) === 0
            && getNumber(current) !== 0
        )
            ? 0
            : (
                (
                    getNumber(current)
                    - getNumber(previous)
                )
                / (
                    getNumber(previous)
                    || 1
                )
            ) * 100;

    return {
        text:
            rate.text === "산정 불가"
                ? "-"
                : `${
                    Math.abs(
                        numericRate
                    ).toFixed(1)
                }% ${
                    numericRate >= 0
                        ? "▲"
                        : "▼"
                }`,
        className:
            rate.text === "산정 불가"
                ? "tooltip-neutral"
                : getComparisonClass(
                    numericRate
                )
    };
}

function comparisonPreviousRow(
    rows,
    rowIndex
) {
    const row =
        rows[rowIndex];

    if (
        row.type
        === "currentYtd"
    ) {
        return rows[
            rowIndex - 1
        ];
    }

    if (
        row.type
        !== "year"
        || rowIndex === 0
    ) {
        return null;
    }

    const candidate =
        rows[
            rowIndex - 1
        ];

    return candidate.type === "year"
        ? candidate
        : null;
}

function renderTable(
    table,
    rows
) {
    const headerCells = [
        `<th class="monthly-stat-year-head">연도</th>`
    ];

    table.columns.forEach((column) => {
        headerCells.push(`
            <th>
                ${column.label.replaceAll(
                    "|",
                    "<br>"
                )}
            </th>
        `);

        if (column.includeDiff) {
            headerCells.push(`
                <th class="monthly-stat-diff-head">
                    전년<br>대비
                </th>
            `);
        }
    });

    const bodyRows =
        rows.map(
            (row, rowIndex) => {
                const previousRow =
                    comparisonPreviousRow(
                        rows,
                        rowIndex
                    );

                const cells = [
                    `
                        <td class="monthly-stat-year-cell">
                            ${row.label}
                        </td>
                    `
                ];

                table.columns.forEach(
                    (column) => {
                        const currentValue =
                            column.getter(
                                row.dataset,
                                row
                            );

                        cells.push(`
                            <td>
                                ${formatValue(
                                    currentValue,
                                    column.format
                                )}
                            </td>
                        `);

                        if (
                            column.includeDiff
                        ) {
                            if (
                                row.type
                                === "previousYtd"
                                || !previousRow
                            ) {
                                cells.push(`
                                    <td class="monthly-stat-diff-cell">
                                        -
                                    </td>
                                `);

                                return;
                            }

                            const previousValue =
                                column.getter(
                                    previousRow.dataset,
                                    previousRow
                                );

                            const difference =
                                diffInfo(
                                    currentValue,
                                    previousValue,
                                    column.format
                                );

                            cells.push(`
                                <td class="monthly-stat-diff-cell ${difference.className}">
                                    ${difference.text}
                                </td>
                            `);
                        }
                    }
                );

                return `
                    <tr class="${
                        row.type === "previousYtd"
                        || row.type === "currentYtd"
                            ? "monthly-stat-ytd-row"
                            : ""
                    }">
                        ${cells.join("")}
                    </tr>
                `;
            }
        ).join("");

    return `
        <article class="dashboard-card monthly-stat-table-card">
            <div class="dashboard-card-header">
                <div>
                    <h2>${table.title}</h2>
                </div>
            </div>

            <div class="monthly-stat-table-wrap">
                <table class="monthly-stat-table">
                    <thead>
                        <tr>
                            ${headerCells.join("")}
                        </tr>
                    </thead>

                    <tbody>
                        ${bodyRows}
                    </tbody>
                </table>
            </div>
        </article>
    `;
}

function yearlySalesMap(
    yearlyCollections,
    firstYear,
    currentYear
) {
    const result =
        new Map();

    for (
        let year = firstYear;
        year <= currentYear;
        year += 1
    ) {
        const dataset =
            yearlyDatasetForYear(
                yearlyCollections,
                year
            );

        result.set(
            year,
            [
                getField(
                    dataset,
                    "dispatch",
                    "textbook_sales_amount"
                )
            ]
        );
    }

    return result;
}

function createSalesTrendChart(
    yearlyCollections,
    firstYear,
    currentYear
) {
    const canvas =
        document.getElementById(
            "monthlyBookSalesChart"
        );

    const labels =
        [];

    const values =
        [];

    for (
        let year = firstYear;
        year <= currentYear;
        year += 1
    ) {
        labels.push(`${year}년`);

        values.push(
            getField(
                yearlyDatasetForYear(
                    yearlyCollections,
                    year
                ),
                "dispatch",
                "textbook_sales_amount"
            )
        );
    }

    return new Chart(canvas, {
        type: "line",

        data: {
            labels,

            datasets: [
                {
                    label: "교재 매출",
                    data: values,
                    borderColor: "#0f6fe8",
                    backgroundColor: "#0f6fe8",
                    borderWidth: 3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.25,
                    fill: false
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: true,
                    position: "right"
                },

                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `교재 매출: ${formatNumber(
                                context.parsed.y
                            )}`
                    }
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: true,

                    ticks: {
                        callback: (value) =>
                            formatNumber(value)
                    }
                }
            }
        }
    });
}

function createCourierComparisonChart(
    yearlyCollections,
    firstYear,
    currentYear
) {
    const canvas =
        document.getElementById(
            "monthlyCourierComparisonChart"
        );

    const labels = [];
    const revenue = [];
    const payment = [];

    for (
        let year = firstYear;
        year <= currentYear;
        year += 1
    ) {
        const dataset =
            yearlyDatasetForYear(
                yearlyCollections,
                year
            );

        labels.push(`${year}년`);

        revenue.push(
            getField(
                dataset,
                "shipping",
                "shipping_fee_amount"
            )
        );

        payment.push(
            getCourierPayment(
                dataset
            )
        );
    }

    return new Chart(canvas, {
        type: "bar",

        data: {
            labels,

            datasets: [
                {
                    label: "배송비 매출",
                    data: revenue,
                    borderRadius: 5,
                    maxBarThickness: 42
                },
                {
                    label: "택배사 총 지급액",
                    data: payment,
                    borderRadius: 5,
                    maxBarThickness: 42
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: true,
                    position: "right"
                },

                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `${context.dataset.label}: ${formatNumber(
                                context.parsed.y
                            )}`
                    }
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: true,

                    ticks: {
                        callback: (value) =>
                            formatNumber(value)
                    }
                }
            }
        }
    });
}


function measureCellContentWidth(cell) {
    const clone =
        cell.cloneNode(true);

    clone.style.position = "absolute";
    clone.style.visibility = "hidden";
    clone.style.width = "auto";
    clone.style.minWidth = "0";
    clone.style.maxWidth = "none";
    clone.style.whiteSpace = "nowrap";
    clone.style.left = "-99999px";
    clone.style.top = "-99999px";

    document.body.appendChild(
        clone
    );

    const width =
        Math.ceil(
            clone.getBoundingClientRect()
                .width
        );

    clone.remove();

    return width;
}

function getMaxMeasuredWidth(cells) {
    return Math.max(
        0,
        ...cells.map(
            measureCellContentWidth
        )
    );
}

function normalizeMonthlyStatColumnWidths() {
    const tables =
        Array.from(
            document.querySelectorAll(
                ".monthly-stat-table"
            )
        );

    if (!tables.length) {
        return;
    }

    const referenceTable =
        tables[0];

    const referenceYearCells =
        Array.from(
            referenceTable.querySelectorAll(
                ".monthly-stat-year-head, .monthly-stat-year-cell"
            )
        );

    const referenceDiffCells =
        Array.from(
            referenceTable.querySelectorAll(
                ".monthly-stat-diff-head, .monthly-stat-diff-cell"
            )
        );

    const allValueCells =
        Array.from(
            document.querySelectorAll(
                ".monthly-stat-table tbody td:not(.monthly-stat-year-cell):not(.monthly-stat-diff-cell)"
            )
        );

    const yearWidth =
        Math.max(
            90,
            getMaxMeasuredWidth(
                referenceYearCells
            )
        );

    const valueWidth =
        Math.max(
            90,
            getMaxMeasuredWidth(
                allValueCells
            )
        );

    const diffWidth =
        Math.max(
            72,
            getMaxMeasuredWidth(
                referenceDiffCells
            )
        );

    tables.forEach((table) => {
        table.style.setProperty(
            "--monthly-stat-year-width",
            `${yearWidth}px`
        );

        table.style.setProperty(
            "--monthly-stat-value-width",
            `${valueWidth}px`
        );

        table.style.setProperty(
            "--monthly-stat-diff-width",
            `${diffWidth}px`
        );
    });
}

function createMarkup() {
    return `
        <section class="monthly-stat-status-row">
            <p
                id="monthlyStatisticsStatus"
                class="period-status"
            >
                월별 통계 자료를 불러오고 있습니다.
            </p>
        </section>

        <section class="monthly-stat-chart-grid">
            <article class="chart-card monthly-stat-chart-card">
                <div class="chart-head">
                    <div>
                        <div class="chart-title">
                            교재 매출 추이
                        </div>

                        <div class="chart-sub">
                            최근 5개년 교재 매출
                        </div>
                    </div>
                </div>

                <div class="chart-box monthly-stat-chart-box">
                    <canvas id="monthlyBookSalesChart"></canvas>
                </div>
            </article>

            <article class="chart-card monthly-stat-chart-card">
                <div class="chart-head">
                    <div>
                        <div class="chart-title">
                            택배 매출 / 지급액 비교
                        </div>

                        <div class="chart-sub">
                            배송비 매출과 택배사 총 지급액
                        </div>
                    </div>
                </div>

                <div class="chart-box monthly-stat-chart-box">
                    <canvas id="monthlyCourierComparisonChart"></canvas>
                </div>
            </article>
        </section>

        <section
            id="monthlyStatisticsTables"
            class="monthly-stat-tables"
        ></section>
    `;
}

export async function mount({
    content,
    actions
}) {
    active = true;
    destroyCharts();

    actions.innerHTML = "";
    content.innerHTML =
        createMarkup();

    const currentYear =
        new Date().getFullYear();

    const firstYear =
        currentYear
        - ANNUAL_YEARS
        + 1;

    const status =
        document.getElementById(
            "monthlyStatisticsStatus"
        );

    try {
        const [
            yearlyCollections,
            cutoffMonth
        ] = await Promise.all([
            loadYearlyCollections(
                firstYear,
                currentYear
            ),
            findCurrentDataMonth(
                currentYear
            )
        ]);

        if (!active) {
            return;
        }

        const previousYtd =
            await loadPreviousYearYtd(
                yearlyCollections,
                currentYear - 1,
                cutoffMonth
            );

        if (!active) {
            return;
        }

        const rows =
            createRows(
                yearlyCollections,
                firstYear,
                currentYear,
                cutoffMonth,
                previousYtd
            );

        document.getElementById(
            "monthlyStatisticsTables"
        ).innerHTML =
            TABLES.map(
                (table) =>
                    renderTable(
                        table,
                        rows
                    )
            ).join("");

        normalizeMonthlyStatColumnWidths();

        salesChart =
            createSalesTrendChart(
                yearlyCollections,
                firstYear,
                currentYear
            );

        courierComparisonChart =
            createCourierComparisonChart(
                yearlyCollections,
                firstYear,
                currentYear
            );

        status.classList.remove(
            "error"
        );

        status.textContent =
            cutoffMonth > 0
                ? `최근 ${ANNUAL_YEARS}개년 연간 합계 · 금년/전년 동기간 ${cutoffMonth}월까지 비교`
                : `최근 ${ANNUAL_YEARS}개년 연간 합계`;
    } catch (error) {
        console.error(
            "[monthlyStatistics]",
            error
        );

        if (!active) {
            return;
        }

        status.classList.add(
            "error"
        );

        status.textContent =
            "월별 통계 자료를 불러오지 못했습니다. Firestore 읽기 권한과 컬렉션을 확인해 주십시오.";
    }
}

export function unmount() {
    active = false;
    destroyCharts();
}
