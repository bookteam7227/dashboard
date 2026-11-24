// /js/pages/daily-report.js

import { serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth } from "../services/firebase.js";
import {
    addCollectionDocument,
    deleteCollectionDocument,
    getCollectionRowsByDocumentIdRange,
    getCollectionRowsByFieldEquals,
    getDocumentRow,
    setCollectionDocument,
    subscribeCollectionRowsByFieldEquals,
    updateCollectionDocument
} from "../services/firestore-service.js";
import { dateToId } from "../utils/date-utils.js";
import { getNumber } from "../utils/number-utils.js";

export const title = "일일보고";

const EVENT_COLLECTION = "dailyReportEventDrafts";
const RESERVATION_COLLECTION = "dailyReportReservationDrafts";
const WORK_COLLECTION = "dailyReportWorkDrafts";
const REPORT_COLLECTION = "dailyReports";

let active = false;
let isAdminUser = false;
let draftDate = "";
let draftFinalized = false;
let eventRows = [];
let reservationRows = [];
let workRows = [];
let unsubscribeEvents = null;
let unsubscribeReservations = null;
let unsubscribeWork = null;
let editingEventId = null;
let editingReservationId = null;
let editingWorkId = null;
let loadedReports = [];

function formatNumber(value) {
    return getNumber(value).toLocaleString("ko-KR");
}

function todayId() {
    return dateToId(new Date());
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeRows(rows) {
    return [...rows].sort((a, b) => {
        const aMillis = a?.createdAt?.toMillis?.() || 0;
        const bMillis = b?.createdAt?.toMillis?.() || 0;

        if (aMillis !== bMillis) {
            return aMillis - bMillis;
        }

        return String(a.id).localeCompare(String(b.id), "ko");
    });
}

function getCurrentUser() {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");
    }

    return user;
}

function canEditRow(row) {
    const user = auth.currentUser;

    return Boolean(
        user
        && (
            isAdminUser
            || row?.createdByUid === user.uid
        )
    );
}

function calculateTextbookShipping(row) {
    const textbookTeam = {
        orders: getNumber(row?.total_orders),
        books: getNumber(row?.total_books)
    };

    const moa = {
        orders:
            getNumber(row?.bookstore_orders)
            + getNumber(row?.unistudy_orders),
        books:
            getNumber(row?.bookstore_books)
            + getNumber(row?.unistudy_books)
    };

    return {
        textbookTeam,
        moa,
        total: {
            orders:
                textbookTeam.orders
                + moa.orders,
            books:
                textbookTeam.books
                + moa.books
        }
    };
}

function textbookShippingText(shipping) {
    return (
        `교재 총 ${formatNumber(shipping?.total?.orders)}건`
        + `·${formatNumber(shipping?.total?.books)}권 발송(교재팀·모아 합계)`
    );
}

function textbookShippingDetailLines(shipping) {
    return [
        `- 교재팀: ${formatNumber(shipping?.textbookTeam?.orders)}건`
            + `·${formatNumber(shipping?.textbookTeam?.books)}권`,
        `- (주)모아: ${formatNumber(shipping?.moa?.orders)}건`
            + `·${formatNumber(shipping?.moa?.books)}권`,
        `- ${textbookShippingText(shipping)}`
    ];
}

function normalizePrizeNames(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 5);
}

function sortEventRowsByOrders(rows) {
    return [...rows].sort((a, b) => {
        const difference =
            getNumber(b?.orders)
            - getNumber(a?.orders);

        if (difference !== 0) {
            return difference;
        }

        const aMillis =
            a?.createdAt?.toMillis?.() || 0;
        const bMillis =
            b?.createdAt?.toMillis?.() || 0;

        return aMillis - bMillis;
    });
}

function reservationReportText(row) {
    const bookNames =
        normalizePrizeNames(
            row?.bookNames
        );

    const bookText =
        bookNames.length
            ? ` 교재(${bookNames.join("·")})`
            : "";

    return (
        `${String(row?.name || "").trim()}`
        + bookText
        + ` ${formatNumber(row?.orders)}건`
        + `·${formatNumber(row?.quantity)}권 발송`
    );
}

function eventReportText(row) {
    const prizeNames = normalizePrizeNames(row?.prizeNames);
    const prizeText =
        prizeNames.length
            ? ` 경품(${prizeNames.join("·")})`
            : "";

    return (
        `${String(row?.name || "").trim()}`
        + prizeText
        + ` ${formatNumber(row?.orders)}건`
        + `·${formatNumber(row?.quantity)}개 발송`
    );
}

function setStatus(message, isError = false) {
    const element = document.getElementById("dailyReportStatus");

    if (!element) {
        return;
    }

    element.classList.toggle("error", isError);
    element.textContent = message;
}

function setComposerStatus(message, isError = false) {
    const element = document.getElementById("dailyReportComposerStatus");

    if (!element) {
        return;
    }

    element.classList.toggle("error", isError);
    element.textContent = message;
}

function createActionsMarkup() {
    return `
        <div class="daily-report-toolbar">
            <div class="datebox">
                <input id="dailyReportStartDate" type="date" aria-label="시작일">
                <span>~</span>
                <input id="dailyReportEndDate" type="date" aria-label="종료일">
            </div>

            <button id="dailyReportSearch" class="btn" type="button">
                검색
            </button>

            <button id="dailyReportOpenComposer" class="btn primary" type="button">
                + 일일보고 작성
            </button>

            <button id="dailyReportOpenWeekly" class="btn" type="button">
                주간보고 보기
            </button>
        </div>
    `;
}

function createMarkup() {
    return `
        <section id="dailyReportComposer" class="daily-report-composer daily-report-drawer" hidden>
            <div class="daily-report-composer-head">
                <div>
                    <h2 id="dailyReportComposerTitle">일일보고 작성</h2>
                    <p>여러 사용자가 항목별로 동시에 작성할 수 있습니다.</p>
                </div>

                <button id="dailyReportCloseComposer" class="btn" type="button">
                    입력 완료
                </button>
            </div>

            <div class="daily-report-date-row">
                <label for="dailyReportDraftDate">작성일</label>
                <input id="dailyReportDraftDate" type="date">
                <span id="dailyReportDraftState" class="daily-report-draft-state">작성중</span>
            </div>

            <section class="daily-report-section">
                <h3>1. 교재 발송</h3>
                <p id="dailyReportTextbookShipping" class="daily-report-preview-line">
                    교재 발송 데이터를 불러오고 있습니다.
                </p>
            </section>

            <section class="daily-report-section">
                <div class="daily-report-section-head">
                    <h3>2. 이벤트 경품 발송</h3>
                    <span>항목별 개별 저장</span>
                </div>

                <div class="daily-report-event-headline">
                    <span>이벤트명</span>
                    <span>물품명</span>
                    <span>건수</span>
                    <span>수량</span>
                </div>

                <div class="daily-report-event-form">
                    <input id="dailyReportEventName" type="text" placeholder="이벤트명" aria-label="이벤트명">
                    <input id="dailyReportEventOrders" type="number" min="0" step="1" placeholder="건수" aria-label="건수">
                    <input id="dailyReportEventQuantity" type="number" min="0" step="1" placeholder="수량" aria-label="수량">

                    <div class="daily-report-prize-inputs">
                        <input id="dailyReportPrizeName1" type="text" placeholder="물품명 1" aria-label="물품명 1">
                        <input id="dailyReportPrizeName2" type="text" placeholder="물품명 2" aria-label="물품명 2">
                        <input id="dailyReportPrizeName3" type="text" placeholder="물품명 3" aria-label="물품명 3">
                        <input id="dailyReportPrizeName4" type="text" placeholder="물품명 4" aria-label="물품명 4">
                        <input id="dailyReportPrizeName5" type="text" placeholder="물품명 5" aria-label="물품명 5">
                    </div>

                    <div class="daily-report-event-form-actions">
                        <button id="dailyReportEventSave" class="btn primary" type="button">추가</button>
                        <button id="dailyReportEventCancel" class="btn" type="button" hidden>취소</button>
                    </div>
                </div>

                <div id="dailyReportEventList" class="daily-report-draft-list"></div>
            </section>

            <section class="daily-report-section">
                <div class="daily-report-section-head">
                    <h3>3. 예약판매 교재 발송</h3>
                    <span>항목별 개별 저장</span>
                </div>

                <div class="daily-report-event-headline">
                    <span>예약판매명</span>
                    <span>교재명</span>
                    <span>건수</span>
                    <span>권수</span>
                </div>

                <div class="daily-report-event-form daily-report-reservation-form">
                    <input id="dailyReportReservationName" type="text" placeholder="예약판매명" aria-label="예약판매명">
                    <input id="dailyReportReservationOrders" type="number" min="0" step="1" placeholder="건수" aria-label="건수">
                    <input id="dailyReportReservationQuantity" type="number" min="0" step="1" placeholder="권수" aria-label="권수">

                    <div class="daily-report-prize-inputs daily-report-book-inputs">
                        <input id="dailyReportBookName1" type="text" placeholder="교재명 1" aria-label="교재명 1">
                        <input id="dailyReportBookName2" type="text" placeholder="교재명 2" aria-label="교재명 2">
                        <input id="dailyReportBookName3" type="text" placeholder="교재명 3" aria-label="교재명 3">
                        <input id="dailyReportBookName4" type="text" placeholder="교재명 4" aria-label="교재명 4">
                        <input id="dailyReportBookName5" type="text" placeholder="교재명 5" aria-label="교재명 5">
                    </div>

                    <div class="daily-report-event-form-actions">
                        <button id="dailyReportReservationSave" class="btn primary" type="button">추가</button>
                        <button id="dailyReportReservationCancel" class="btn" type="button" hidden>취소</button>
                    </div>
                </div>

                <div id="dailyReportReservationList" class="daily-report-draft-list"></div>
            </section>

            <section class="daily-report-section">
                <div class="daily-report-section-head">
                    <h3>4. 업무 내용 및 기안 상신</h3>
                    <span>항목별 개별 저장</span>
                </div>

                <div class="daily-report-work-form">
                    <textarea
                        id="dailyReportWorkContent"
                        rows="3"
                        placeholder="업무 내용 또는 기안 상신 내용을 입력하십시오."
                    ></textarea>

                    <div class="daily-report-form-actions">
                        <button id="dailyReportWorkSave" class="btn primary" type="button">추가</button>
                        <button id="dailyReportWorkCancel" class="btn" type="button" hidden>취소</button>
                    </div>
                </div>

                <div id="dailyReportWorkList" class="daily-report-draft-list"></div>
            </section>

            <div id="dailyReportComposerStatus" class="daily-report-status"></div>

            <div id="dailyReportFinalizeArea" class="daily-report-finalize-area" hidden>
                <button id="dailyReportFinalize" class="btn primary" type="button">
                    일일보고 확정
                </button>
            </div>
        </section>

        <div id="dailyReportStatus" class="daily-report-status"></div>
        <section id="dailyReportResults" class="daily-report-results"></section>

        <section
            id="dailyReportWeeklyPanel"
            class="daily-report-plain-panel daily-report-weekly-panel"
            hidden
        >
            <div class="daily-report-plain-head">
                <div>
                    <h2>주간보고</h2>
                    <p>
                        현재 검색된 일일보고를 기준으로 주간 내용을 통합합니다.
                    </p>
                </div>

                <div class="daily-report-plain-head-actions">
                    <button
                        id="dailyReportWeeklyCopy"
                        class="btn primary"
                        type="button"
                    >
                        텍스트 복사
                    </button>

                    <button
                        id="dailyReportWeeklyClose"
                        class="btn"
                        type="button"
                    >
                        닫기
                    </button>
                </div>
            </div>

            <div
                id="dailyReportWeeklyText"
                class="daily-report-plain-textarea daily-report-weekly-text"
                contenteditable="false"
                aria-label="주간보고 미리보기"
            ></div>
        </section>

        <section
            id="dailyReportPlainPanel"
            class="daily-report-plain-panel"
            hidden
        >
            <div class="daily-report-plain-head">
                <div>
                    <h2>메일용 텍스트</h2>
                    <p>
                        메일의 기본 글꼴은 유지하고, 각 항목 제목만 굵게 복사됩니다.
                    </p>
                </div>

                <div class="daily-report-plain-head-actions">
                    <button
                        id="dailyReportPlainCopy"
                        class="btn primary"
                        type="button"
                    >
                        텍스트 복사
                    </button>

                    <button
                        id="dailyReportPlainClose"
                        class="btn"
                        type="button"
                    >
                        닫기
                    </button>
                </div>
            </div>

            <div
                id="dailyReportPlainText"
                class="daily-report-plain-textarea"
                contenteditable="false"
                aria-label="메일용 텍스트 미리보기"
            ></div>
        </section>
    `;
}

function stopDraftSubscriptions() {
    unsubscribeEvents?.();
    unsubscribeReservations?.();
    unsubscribeWork?.();
    unsubscribeEvents = null;
    unsubscribeReservations = null;
    unsubscribeWork = null;
}

function resetEventForm() {
    editingEventId = null;

    document.getElementById("dailyReportEventName").value = "";

    Array.from(
        { length: 5 },
        (_, index) =>
            document.getElementById(
                `dailyReportPrizeName${index + 1}`
            )
    ).forEach((input) => {
        input.value = "";
    });

    document.getElementById("dailyReportEventOrders").value = "";
    document.getElementById("dailyReportEventQuantity").value = "";
    document.getElementById("dailyReportEventSave").textContent = "추가";
    document.getElementById("dailyReportEventCancel").hidden = true;
}

function resetReservationForm() {
    editingReservationId = null;

    document.getElementById("dailyReportReservationName").value = "";

    Array.from(
        { length: 5 },
        (_, index) =>
            document.getElementById(
                `dailyReportBookName${index + 1}`
            )
    ).forEach((input) => {
        input.value = "";
    });

    document.getElementById("dailyReportReservationOrders").value = "";
    document.getElementById("dailyReportReservationQuantity").value = "";
    document.getElementById("dailyReportReservationSave").textContent = "추가";
    document.getElementById("dailyReportReservationCancel").hidden = true;
}

function resetWorkForm() {
    editingWorkId = null;

    document.getElementById("dailyReportWorkContent").value = "";
    document.getElementById("dailyReportWorkSave").textContent = "추가";
    document.getElementById("dailyReportWorkCancel").hidden = true;
}

function setDraftInputsDisabled(disabled) {
    [
        "dailyReportEventName",
        "dailyReportPrizeName1",
        "dailyReportPrizeName2",
        "dailyReportPrizeName3",
        "dailyReportPrizeName4",
        "dailyReportPrizeName5",
        "dailyReportEventOrders",
        "dailyReportEventQuantity",
        "dailyReportEventSave",
        "dailyReportReservationName",
        "dailyReportBookName1",
        "dailyReportBookName2",
        "dailyReportBookName3",
        "dailyReportBookName4",
        "dailyReportBookName5",
        "dailyReportReservationOrders",
        "dailyReportReservationQuantity",
        "dailyReportReservationSave",
        "dailyReportWorkContent",
        "dailyReportWorkSave"
    ].forEach((id) => {
        const element = document.getElementById(id);

        if (element) {
            element.disabled = disabled;
        }
    });
}

function renderDraftState() {
    const state = document.getElementById("dailyReportDraftState");
    const finalizeArea = document.getElementById("dailyReportFinalizeArea");
    const finalizeButton = document.getElementById("dailyReportFinalize");

    state.classList.toggle("is-finalized", draftFinalized);
    state.textContent = draftFinalized ? "확정됨" : "작성중";

    finalizeArea.hidden = !isAdminUser;
    finalizeButton.textContent = draftFinalized
        ? "일일보고 재확정"
        : "일일보고 확정";

    const locked = draftFinalized && !isAdminUser;
    setDraftInputsDisabled(locked);

    if (locked) {
        setComposerStatus(
            "확정된 일일보고입니다. 일반 사용자는 내용을 추가하거나 수정할 수 없습니다."
        );
    } else {
        setComposerStatus(
            "입력한 항목은 즉시 개별 저장되며 다른 사용자의 화면에도 자동 반영됩니다."
        );
    }
}

function renderEventRows() {
    const container = document.getElementById("dailyReportEventList");

    if (!eventRows.length) {
        container.innerHTML = `
            <div class="daily-report-empty">
                등록된 이벤트 경품 발송이 없습니다.
            </div>
        `;
        return;
    }

    container.innerHTML = eventRows.map((row) => {
        const editable = canEditRow(row) && (!draftFinalized || isAdminUser);
        const text =
            eventReportText(row);

        return `
            <div class="daily-report-draft-item">
                <div class="daily-report-draft-text">- ${escapeHtml(text)}</div>
                ${
                    editable
                        ? `
                            <div class="daily-report-item-actions">
                                <button class="daily-report-link-button" type="button" data-action="edit-event" data-id="${escapeHtml(row.id)}">수정</button>
                                <button class="daily-report-link-button is-danger" type="button" data-action="delete-event" data-id="${escapeHtml(row.id)}">삭제</button>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    }).join("");
}

function renderReservationRows() {
    const container =
        document.getElementById(
            "dailyReportReservationList"
        );

    if (!reservationRows.length) {
        container.innerHTML = `
            <div class="daily-report-empty">
                등록된 예약판매 교재 발송이 없습니다.
            </div>
        `;
        return;
    }

    container.innerHTML =
        reservationRows.map((row) => {
            const editable =
                canEditRow(row)
                && (!draftFinalized || isAdminUser);

            const text =
                reservationReportText(row);

            return `
                <div class="daily-report-draft-item">
                    <div class="daily-report-draft-text">- ${escapeHtml(text)}</div>
                    ${
                        editable
                            ? `
                                <div class="daily-report-item-actions">
                                    <button class="daily-report-link-button" type="button" data-action="edit-reservation" data-id="${escapeHtml(row.id)}">수정</button>
                                    <button class="daily-report-link-button is-danger" type="button" data-action="delete-reservation" data-id="${escapeHtml(row.id)}">삭제</button>
                                </div>
                            `
                            : ""
                    }
                </div>
            `;
        }).join("");
}

function renderWorkRows() {
    const container = document.getElementById("dailyReportWorkList");

    if (!workRows.length) {
        container.innerHTML = `
            <div class="daily-report-empty">
                등록된 업무 내용 및 기안 상신이 없습니다.
            </div>
        `;
        return;
    }

    container.innerHTML = workRows.map((row) => {
        const editable = canEditRow(row) && (!draftFinalized || isAdminUser);

        return `
            <div class="daily-report-draft-item">
                <div class="daily-report-draft-text daily-report-prewrap">- ${escapeHtml(row.content)}</div>
                ${
                    editable
                        ? `
                            <div class="daily-report-item-actions">
                                <button class="daily-report-link-button" type="button" data-action="edit-work" data-id="${escapeHtml(row.id)}">수정</button>
                                <button class="daily-report-link-button is-danger" type="button" data-action="delete-work" data-id="${escapeHtml(row.id)}">삭제</button>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    }).join("");
}

function renderTextbookShipping(shipping) {
    document.getElementById("dailyReportTextbookShipping").innerHTML =
        textbookShippingDetailLines(shipping)
            .map((line) => `<span>${escapeHtml(line)}</span>`)
            .join("");
}

async function loadTextbookShipping(dateId) {
    const row = await getDocumentRow("shippingProgress", dateId);
    const shipping = calculateTextbookShipping(row);

    renderTextbookShipping(shipping);

    return shipping;
}

async function refreshFinalizedState(dateId) {
    const report = await getDocumentRow(REPORT_COLLECTION, dateId);
    draftFinalized = Boolean(report);
    renderDraftState();
    return report;
}

function subscribeDrafts(dateId) {
    stopDraftSubscriptions();

    unsubscribeEvents = subscribeCollectionRowsByFieldEquals(
        EVENT_COLLECTION,
        "date",
        dateId,
        (rows) => {
            if (!active || dateId !== draftDate) {
                return;
            }

            eventRows =
                    sortEventRowsByOrders(
                        rows
                    );
            renderEventRows();
        },
        (error) => {
            console.error("[daily-report:event-subscribe]", error);
            setComposerStatus(
                "이벤트 경품 발송 항목을 실시간으로 불러오지 못했습니다.",
                true
            );
        }
    );

    unsubscribeReservations =
        subscribeCollectionRowsByFieldEquals(
            RESERVATION_COLLECTION,
            "date",
            dateId,
            (rows) => {
                if (!active || dateId !== draftDate) {
                    return;
                }

                reservationRows =
                    sortEventRowsByOrders(
                        rows
                    );

                renderReservationRows();
            },
            (error) => {
                console.error(
                    "[daily-report:reservation-subscribe]",
                    error
                );

                setComposerStatus(
                    "예약판매 교재 발송 항목을 실시간으로 불러오지 못했습니다.",
                    true
                );
            }
        );

    unsubscribeWork = subscribeCollectionRowsByFieldEquals(
        WORK_COLLECTION,
        "date",
        dateId,
        (rows) => {
            if (!active || dateId !== draftDate) {
                return;
            }

            workRows = normalizeRows(rows);
            renderWorkRows();
        },
        (error) => {
            console.error("[daily-report:work-subscribe]", error);
            setComposerStatus(
                "업무 내용 항목을 실시간으로 불러오지 못했습니다.",
                true
            );
        }
    );
}

async function openComposer(dateId = todayId()) {
    draftDate = dateId;
    eventRows = [];
    reservationRows = [];
    workRows = [];
    resetEventForm();
    resetReservationForm();
    resetWorkForm();

    const composer =
        document.getElementById(
            "dailyReportComposer"
        );

    composer.hidden = false;

    requestAnimationFrame(() => {
        composer.classList.add(
            "is-open"
        );
    });
    document.getElementById("dailyReportDraftDate").value = dateId;
    document.getElementById("dailyReportComposerTitle").textContent =
        `${dateId} 일일보고 작성`;

    setComposerStatus("작성 내용을 불러오고 있습니다.");
    subscribeDrafts(dateId);

    const finalizedReport =
        await refreshFinalizedState(dateId);

    if (finalizedReport) {
        const isToday =
            dateId === todayId();

        const shipping =
            isToday
                ? await loadTextbookShipping(
                    dateId
                )
                : normalizeStoredTextbookShipping(
                    finalizedReport.textbookShipping
                );

        if (!isToday) {
            renderTextbookShipping(
                shipping
            );
        }

        document.getElementById("dailyReportComposerTitle").textContent =
            `${dateId} 일일보고 수정`;

        setComposerStatus(
            isToday
                ? "오늘 일일보고는 대시보드의 최신 교재 발송 수치를 반영하며, 이벤트 경품 발송과 업무 내용을 수정할 수 있습니다."
                : "과거 일일보고는 확정 당시 교재 발송 수치를 고정하며, 이벤트 경품 발송과 업무 내용만 수정할 수 있습니다."
        );
        return;
    }

    await loadTextbookShipping(dateId);
}

function closeComposer() {
    stopDraftSubscriptions();

    const composer =
        document.getElementById(
            "dailyReportComposer"
        );

    composer.classList.remove(
        "is-open"
    );
    composer.hidden = true;

    draftDate = "";
    eventRows = [];
    reservationRows = [];
    workRows = [];
    resetEventForm();
    resetReservationForm();
    resetWorkForm();
}

async function saveEvent() {
    try {
        if (draftFinalized && !isAdminUser) {
            throw new Error("확정된 일일보고는 수정할 수 없습니다.");
        }

        const user = getCurrentUser();
        const name = document.getElementById("dailyReportEventName").value.trim();
        const prizeNames =
            normalizePrizeNames(
                Array.from(
                    { length: 5 },
                    (_, index) =>
                        document.getElementById(
                            `dailyReportPrizeName${index + 1}`
                        ).value
                )
            );
        const orders = Number(document.getElementById("dailyReportEventOrders").value);
        const quantity = Number(document.getElementById("dailyReportEventQuantity").value);

        if (!name) {
            throw new Error("이벤트명을 입력해 주십시오.");
        }

        if (!Number.isInteger(orders) || orders < 0) {
            throw new Error("건수는 0 이상의 정수로 입력해 주십시오.");
        }

        if (!Number.isInteger(quantity) || quantity < 0) {
            throw new Error("수량은 0 이상의 정수로 입력해 주십시오.");
        }

        if (editingEventId) {
            await updateCollectionDocument(
                EVENT_COLLECTION,
                editingEventId,
                {
                    name,
                    prizeNames,
                    orders,
                    quantity,
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByEmail: user.email || ""
                }
            );
        } else {
            await addCollectionDocument(
                EVENT_COLLECTION,
                {
                    date: draftDate,
                    name,
                    prizeNames,
                    orders,
                    quantity,
                    createdAt: serverTimestamp(),
                    createdByUid: user.uid,
                    createdByEmail: user.email || "",
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByEmail: user.email || ""
                }
            );
        }

        resetEventForm();
        setComposerStatus("이벤트 경품 발송 항목이 저장되었습니다.");
    } catch (error) {
        console.error("[daily-report:save-event]", error);
        setComposerStatus(
            error?.message || "이벤트 경품 발송 항목을 저장하지 못했습니다.",
            true
        );
    }
}

async function saveReservation() {
    try {
        if (draftFinalized && !isAdminUser) {
            throw new Error(
                "확정된 일일보고는 수정할 수 없습니다."
            );
        }

        const user = getCurrentUser();
        const name =
            document.getElementById(
                "dailyReportReservationName"
            ).value.trim();

        const bookNames =
            normalizePrizeNames(
                Array.from(
                    { length: 5 },
                    (_, index) =>
                        document.getElementById(
                            `dailyReportBookName${index + 1}`
                        ).value
                )
            );

        const orders =
            Number(
                document.getElementById(
                    "dailyReportReservationOrders"
                ).value
            );

        const quantity =
            Number(
                document.getElementById(
                    "dailyReportReservationQuantity"
                ).value
            );

        if (!name) {
            throw new Error(
                "예약판매명을 입력해 주십시오."
            );
        }

        if (!Number.isInteger(orders) || orders < 0) {
            throw new Error(
                "건수는 0 이상의 정수로 입력해 주십시오."
            );
        }

        if (!Number.isInteger(quantity) || quantity < 0) {
            throw new Error(
                "수량은 0 이상의 정수로 입력해 주십시오."
            );
        }

        const payload = {
            name,
            bookNames,
            orders,
            quantity,
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
            updatedByEmail: user.email || ""
        };

        if (editingReservationId) {
            await updateCollectionDocument(
                RESERVATION_COLLECTION,
                editingReservationId,
                payload
            );
        } else {
            await addCollectionDocument(
                RESERVATION_COLLECTION,
                {
                    date: draftDate,
                    ...payload,
                    createdAt: serverTimestamp(),
                    createdByUid: user.uid,
                    createdByEmail: user.email || ""
                }
            );
        }

        resetReservationForm();

        setComposerStatus(
            "예약판매 교재 발송 항목이 저장되었습니다."
        );
    } catch (error) {
        console.error(
            "[daily-report:save-reservation]",
            error
        );

        setComposerStatus(
            error?.message
                || "예약판매 교재 발송 항목을 저장하지 못했습니다.",
            true
        );
    }
}

async function saveWork() {
    try {
        if (draftFinalized && !isAdminUser) {
            throw new Error("확정된 일일보고는 수정할 수 없습니다.");
        }

        const user = getCurrentUser();
        const content = document.getElementById("dailyReportWorkContent").value.trim();

        if (!content) {
            throw new Error("업무 내용을 입력해 주십시오.");
        }

        if (editingWorkId) {
            await updateCollectionDocument(
                WORK_COLLECTION,
                editingWorkId,
                {
                    content,
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByEmail: user.email || ""
                }
            );
        } else {
            await addCollectionDocument(
                WORK_COLLECTION,
                {
                    date: draftDate,
                    content,
                    createdAt: serverTimestamp(),
                    createdByUid: user.uid,
                    createdByEmail: user.email || "",
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByEmail: user.email || ""
                }
            );
        }

        resetWorkForm();
        setComposerStatus("업무 내용 및 기안 상신 항목이 저장되었습니다.");
    } catch (error) {
        console.error("[daily-report:save-work]", error);
        setComposerStatus(
            error?.message || "업무 내용을 저장하지 못했습니다.",
            true
        );
    }
}

function startEventEdit(id) {
    const row = eventRows.find((item) => item.id === id);

    if (!row || !canEditRow(row)) {
        return;
    }

    editingEventId = id;
    document.getElementById("dailyReportEventName").value = row.name || "";

    const prizeNames =
        normalizePrizeNames(
            row.prizeNames
        );

    Array.from(
        { length: 5 },
        (_, index) =>
            document.getElementById(
                `dailyReportPrizeName${index + 1}`
            )
    ).forEach((input, index) => {
        input.value = prizeNames[index] || "";
    });

    document.getElementById("dailyReportEventOrders").value = getNumber(row.orders);
    document.getElementById("dailyReportEventQuantity").value = getNumber(row.quantity);
    document.getElementById("dailyReportEventSave").textContent = "수정 저장";
    document.getElementById("dailyReportEventCancel").hidden = false;
}

function startReservationEdit(id) {
    const row =
        reservationRows.find(
            (item) =>
                item.id === id
        );

    if (!row || !canEditRow(row)) {
        return;
    }

    editingReservationId = id;

    document.getElementById(
        "dailyReportReservationName"
    ).value = row.name || "";

    const bookNames =
        normalizePrizeNames(
            row.bookNames
        );

    Array.from(
        { length: 5 },
        (_, index) =>
            document.getElementById(
                `dailyReportBookName${index + 1}`
            )
    ).forEach((input, index) => {
        input.value =
            bookNames[index] || "";
    });

    document.getElementById(
        "dailyReportReservationOrders"
    ).value = getNumber(row.orders);

    document.getElementById(
        "dailyReportReservationQuantity"
    ).value = getNumber(row.quantity);

    document.getElementById(
        "dailyReportReservationSave"
    ).textContent = "수정 저장";

    document.getElementById(
        "dailyReportReservationCancel"
    ).hidden = false;
}

function startWorkEdit(id) {
    const row = workRows.find((item) => item.id === id);

    if (!row || !canEditRow(row)) {
        return;
    }

    editingWorkId = id;
    document.getElementById("dailyReportWorkContent").value = row.content || "";
    document.getElementById("dailyReportWorkSave").textContent = "수정 저장";
    document.getElementById("dailyReportWorkCancel").hidden = false;
}

async function deleteEvent(id) {
    const row = eventRows.find((item) => item.id === id);

    if (!row || !canEditRow(row)) {
        return;
    }

    if (!window.confirm("이 이벤트 경품 발송 항목을 삭제하시겠습니까?")) {
        return;
    }

    try {
        await deleteCollectionDocument(EVENT_COLLECTION, id);

        if (editingEventId === id) {
            resetEventForm();
        }
    } catch (error) {
        console.error("[daily-report:delete-event]", error);
        setComposerStatus("이벤트 경품 발송 항목을 삭제하지 못했습니다.", true);
    }
}

async function deleteReservation(id) {
    const row =
        reservationRows.find(
            (item) =>
                item.id === id
        );

    if (!row || !canEditRow(row)) {
        return;
    }

    if (
        !window.confirm(
            "이 예약판매 교재 발송 항목을 삭제하시겠습니까?"
        )
    ) {
        return;
    }

    try {
        await deleteCollectionDocument(
            RESERVATION_COLLECTION,
            id
        );

        if (editingReservationId === id) {
            resetReservationForm();
        }
    } catch (error) {
        console.error(
            "[daily-report:delete-reservation]",
            error
        );

        setComposerStatus(
            "예약판매 교재 발송 항목을 삭제하지 못했습니다.",
            true
        );
    }
}

async function deleteWork(id) {
    const row = workRows.find((item) => item.id === id);

    if (!row || !canEditRow(row)) {
        return;
    }

    if (!window.confirm("이 업무 내용 항목을 삭제하시겠습니까?")) {
        return;
    }

    try {
        await deleteCollectionDocument(WORK_COLLECTION, id);

        if (editingWorkId === id) {
            resetWorkForm();
        }
    } catch (error) {
        console.error("[daily-report:delete-work]", error);
        setComposerStatus("업무 내용 항목을 삭제하지 못했습니다.", true);
    }
}

async function finalizeReport() {
    if (!isAdminUser) {
        return;
    }

    const question = draftFinalized
        ? "현재 내용으로 일일보고를 다시 확정하시겠습니까?"
        : "현재 내용으로 일일보고를 확정하시겠습니까?";

    if (!window.confirm(question)) {
        return;
    }

    try {
        const user = getCurrentUser();
        setComposerStatus("최신 작성 내용을 취합하여 일일보고를 확정하고 있습니다.");

        const existingReport =
            draftFinalized
                ? await getDocumentRow(
                    REPORT_COLLECTION,
                    draftDate
                )
                : null;

        const shouldRefreshShipping =
            !existingReport
            || draftDate === todayId();

        const [
            shippingRow,
            events,
            reservations,
            works
        ] = await Promise.all([
            shouldRefreshShipping
                ? getDocumentRow(
                    "shippingProgress",
                    draftDate
                )
                : Promise.resolve(null),
            getCollectionRowsByFieldEquals(
                EVENT_COLLECTION,
                "date",
                draftDate
            ),
            getCollectionRowsByFieldEquals(
                RESERVATION_COLLECTION,
                "date",
                draftDate
            ),
            getCollectionRowsByFieldEquals(
                WORK_COLLECTION,
                "date",
                draftDate
            )
        ]);

        const shipping =
            shouldRefreshShipping
                ? calculateTextbookShipping(
                    shippingRow
                )
                : normalizeStoredTextbookShipping(
                    existingReport.textbookShipping
                );

        const sortedEvents =
            sortEventRowsByOrders(
                events
            );
        const sortedReservations =
            sortEventRowsByOrders(
                reservations
            );
        const sortedWorks = normalizeRows(works);

        await setCollectionDocument(
            REPORT_COLLECTION,
            draftDate,
            {
                date: draftDate,
                textbookShipping: {
                    textbookTeam: {
                        orders: shipping.textbookTeam.orders,
                        books: shipping.textbookTeam.books
                    },
                    moa: {
                        orders: shipping.moa.orders,
                        books: shipping.moa.books
                    },
                    total: {
                        orders: shipping.total.orders,
                        books: shipping.total.books
                    }
                },
                events: sortedEvents.map((row) => ({
                    name: String(row.name || ""),
                    prizeNames: normalizePrizeNames(row.prizeNames),
                    orders: getNumber(row.orders),
                    quantity: getNumber(row.quantity),
                    createdByUid: String(row.createdByUid || ""),
                    createdByEmail: String(row.createdByEmail || "")
                })),
                reservations: sortedReservations.map((row) => ({
                    name: String(row.name || ""),
                    bookNames: normalizePrizeNames(row.bookNames),
                    orders: getNumber(row.orders),
                    quantity: getNumber(row.quantity),
                    createdByUid: String(row.createdByUid || ""),
                    createdByEmail: String(row.createdByEmail || "")
                })),
                workItems: sortedWorks.map((row) => ({
                    content: String(row.content || ""),
                    createdByUid: String(row.createdByUid || ""),
                    createdByEmail: String(row.createdByEmail || "")
                })),
                finalizedAt: serverTimestamp(),
                finalizedByUid: user.uid,
                finalizedByEmail: user.email || ""
            }
        );

        draftFinalized = true;
        renderDraftState();
        renderTextbookShipping(shipping);
        setComposerStatus("일일보고가 확정되었습니다.");
        await searchReports();
    } catch (error) {
        console.error("[daily-report:finalize]", error);
        setComposerStatus(
            error?.message || "일일보고를 확정하지 못했습니다.",
            true
        );
    }
}

function normalizeStoredTextbookShipping(value) {
    if (
        value?.textbookTeam
        || value?.moa
        || value?.total
    ) {
        return {
            textbookTeam: {
                orders: getNumber(value?.textbookTeam?.orders),
                books: getNumber(value?.textbookTeam?.books)
            },
            moa: {
                orders: getNumber(value?.moa?.orders),
                books: getNumber(value?.moa?.books)
            },
            total: {
                orders: getNumber(value?.total?.orders),
                books: getNumber(value?.total?.books)
            }
        };
    }

    return {
        textbookTeam: {
            orders: 0,
            books: 0
        },
        moa: {
            orders: 0,
            books: 0
        },
        total: {
            orders: getNumber(value?.orders),
            books: getNumber(value?.books)
        }
    };
}

function getWeeklyTextbookShippingTotal() {
    return loadedReports.reduce(
        (total, report) => {
            const shipping =
                normalizeStoredTextbookShipping(
                    report?.textbookShipping
                );

            total.textbookTeam.orders +=
                getNumber(
                    shipping?.textbookTeam?.orders
                );

            total.textbookTeam.books +=
                getNumber(
                    shipping?.textbookTeam?.books
                );

            total.moa.orders +=
                getNumber(
                    shipping?.moa?.orders
                );

            total.moa.books +=
                getNumber(
                    shipping?.moa?.books
                );

            total.total.orders +=
                getNumber(
                    shipping?.total?.orders
                );

            total.total.books +=
                getNumber(
                    shipping?.total?.books
                );

            return total;
        },
        {
            textbookTeam: {
                orders: 0,
                books: 0
            },
            moa: {
                orders: 0,
                books: 0
            },
            total: {
                orders: 0,
                books: 0
            }
        }
    );
}

function getWeeklyPreviousYearShippingTotal() {
    return loadedReports.reduce(
        (total, report) => {
            const previousYear =
                report?.shippingComparison?.previous_year;

            if (!previousYear) {
                return total;
            }

            total.orders +=
                getNumber(
                    previousYear?.lecture_orders
                )
                + getNumber(
                    previousYear?.unistudy_orders
                )
                + getNumber(
                    previousYear?.bookstore_orders
                );

            total.books +=
                getNumber(
                    previousYear?.lecture_books
                )
                + getNumber(
                    previousYear?.unistudy_books
                )
                + getNumber(
                    previousYear?.bookstore_books
                );

            total.availableDays += 1;

            return total;
        },
        {
            orders: 0,
            books: 0,
            availableDays: 0
        }
    );
}

function getYearOverYearRateData(
    currentValue,
    previousValue
) {
    const current = getNumber(currentValue);
    const previous = getNumber(previousValue);

    if (previous <= 0) {
        return {
            text: "비교불가",
            direction: "neutral"
        };
    }

    const rate =
        ((current - previous) / previous) * 100;

    if (rate > 0) {
        return {
            text: `${Math.abs(rate).toFixed(1)}% ▲`,
            direction: "up"
        };
    }

    if (rate < 0) {
        return {
            text: `${Math.abs(rate).toFixed(1)}% ▼`,
            direction: "down"
        };
    }

    return {
        text: "0.0%",
        direction: "neutral"
    };
}

function formatYearOverYearRate(
    currentValue,
    previousValue
) {
    return getYearOverYearRateData(
        currentValue,
        previousValue
    ).text;
}

function yearOverYearRateHtml(
    currentValue,
    previousValue
) {
    const result =
        getYearOverYearRateData(
            currentValue,
            previousValue
        );

    const className =
        result.direction === "up"
            ? "is-positive"
            : result.direction === "down"
                ? "is-negative"
                : "is-neutral";

    return `<span class="daily-report-weekly-yoy ${className}">`
        + `${escapeHtml(result.text)}</span>`;
}

function getWeeklyReportGroups() {
    const reservations = [];
    const works = [];
    const events = [];

    loadedReports.forEach((report) => {
        const dateLabel =
            formatReportMonthDay(
                report?.id
            );

        const reportReservations =
            Array.isArray(
                report?.reservations
            )
                ? sortEventRowsByOrders(
                    report.reservations
                )
                : [];

        reportReservations.forEach((item) => {
            reservations.push({
                text:
                    reservationReportText(
                        item
                    ).trim(),
                dateLabel
            });
        });

        const reportWorks =
            Array.isArray(
                report?.workItems
            )
                ? report.workItems
                : [];

        reportWorks.forEach((item) => {
            const text =
                String(
                    item?.content || ""
                ).trim();

            if (text) {
                works.push({
                    text,
                    dateLabel
                });
            }
        });

        const reportEvents =
            Array.isArray(
                report?.events
            )
                ? sortEventRowsByOrders(
                    report.events
                )
                : [];

        reportEvents.forEach((item) => {
            events.push({
                text:
                    eventReportText(
                        item
                    ).trim(),
                dateLabel
            });
        });
    });

    return {
        reservations,
        works,
        events
    };
}

function createWeeklyPlainText() {
    const {
        reservations,
        works,
        events
    } = getWeeklyReportGroups();

    const shipping =
        getWeeklyTextbookShippingTotal();

    const previousYear =
        getWeeklyPreviousYearShippingTotal();

    const lines = [
        `교재팀: ${formatNumber(shipping.textbookTeam.orders)}건`
            + `·${formatNumber(shipping.textbookTeam.books)}권`,
        `(주)모아: ${formatNumber(shipping.moa.orders)}건`
            + `·${formatNumber(shipping.moa.books)}권`,
        `교재 총 ${formatNumber(shipping.total.orders)}건`
            + `·${formatNumber(shipping.total.books)}권 발송(교재팀·모아 합계)`,
        `전년대비 건수 ${formatYearOverYearRate(
            shipping.total.orders,
            previousYear.orders
        )} · 권수 ${formatYearOverYearRate(
            shipping.total.books,
            previousYear.books
        )}`
    ];

    const appendSection =
        (title, rows) => {
            if (!rows.length) {
                return;
            }

            if (lines.length) {
                lines.push("");
            }

            lines.push(title);

            rows.forEach((row) => {
                lines.push(
                    `${row.text} ${row.dateLabel}`
                );
            });
        };

    appendSection(
        "예약판매 교재 발송 진행",
        reservations
    );

    appendSection(
        "주요 업무 및 기안 상신 업무 진행",
        works
    );

    appendSection(
        "이벤트 물품 발송 진행",
        events
    );

    return lines.join("\n").trim();
}

function createWeeklyHtml() {
    const {
        reservations,
        works,
        events
    } = getWeeklyReportGroups();

    const shipping =
        getWeeklyTextbookShippingTotal();

    const previousYear =
        getWeeklyPreviousYearShippingTotal();

    const blocks = [
        `<div>교재팀: ${formatNumber(shipping.textbookTeam.orders)}건`
            + `·${formatNumber(shipping.textbookTeam.books)}권</div>`,
        `<div>(주)모아: ${formatNumber(shipping.moa.orders)}건`
            + `·${formatNumber(shipping.moa.books)}권</div>`,
        `<div>교재 총 ${formatNumber(shipping.total.orders)}건`
            + `·${formatNumber(shipping.total.books)}권 발송(교재팀·모아 합계)</div>`,
        `<div>전년대비 건수 ${yearOverYearRateHtml(
            shipping.total.orders,
            previousYear.orders
        )} · 권수 ${yearOverYearRateHtml(
            shipping.total.books,
            previousYear.books
        )}</div>`
    ];

    const appendSection =
        (title, rows) => {
            if (!rows.length) {
                return;
            }

            if (blocks.length) {
                blocks.push(
                    '<div class="daily-report-weekly-spacer"><br></div>'
                );
            }

            blocks.push(
                `<div class="daily-report-weekly-title"><strong>${escapeHtml(title)}</strong></div>`
            );

            rows.forEach((row) => {
                blocks.push(
                    `<div>${escapeHtml(row.text)} <span class="daily-report-weekly-date">${escapeHtml(row.dateLabel)}</span></div>`
                );
            });
        };

    appendSection(
        "예약판매 교재 발송 진행",
        reservations
    );

    appendSection(
        "주요 업무 및 기안 상신 업무 진행",
        works
    );

    appendSection(
        "이벤트 물품 발송 진행",
        events
    );

    return blocks.join("");
}

function openWeeklyReport() {
    if (!loadedReports.length) {
        setStatus(
            "먼저 주간보고에 사용할 날짜 범위를 검색해 주십시오.",
            true
        );
        return;
    }

    const html =
        createWeeklyHtml();

    if (!html) {
        setStatus(
            "검색 기간에 주간보고로 표시할 항목이 없습니다.",
            true
        );
        return;
    }

    const panel =
        document.getElementById(
            "dailyReportWeeklyPanel"
        );

    const preview =
        document.getElementById(
            "dailyReportWeeklyText"
        );

    preview.innerHTML = html;
    panel.hidden = false;

    panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeWeeklyReport() {
    const panel =
        document.getElementById(
            "dailyReportWeeklyPanel"
        );

    if (panel) {
        panel.hidden = true;
    }
}

async function copyWeeklyReport() {
    const text =
        createWeeklyPlainText();

    const html =
        createWeeklyHtml();

    if (!text || !html) {
        return;
    }

    try {
        if (
            navigator.clipboard
            && typeof ClipboardItem
                !== "undefined"
        ) {
            const item =
                new ClipboardItem({
                    "text/plain":
                        new Blob(
                            [text],
                            {
                                type:
                                    "text/plain"
                            }
                        ),
                    "text/html":
                        new Blob(
                            [html],
                            {
                                type:
                                    "text/html"
                            }
                        )
                });

            await navigator.clipboard.write([
                item
            ]);
        } else {
            await navigator.clipboard.writeText(
                text
            );
        }

        setStatus(
            "주간보고 내용을 복사했습니다."
        );
    } catch (error) {
        console.error(
            "[daily-report:copy-weekly]",
            error
        );

        setStatus(
            "주간보고 자동 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해 주십시오.",
            true
        );
    }
}

function formatReportMonthDay(dateId) {
    const parts =
        String(dateId || "")
            .split("-")
            .map((value) =>
                Number(value)
            );

    if (
        parts.length !== 3
        || !parts[1]
        || !parts[2]
    ) {
        return "";
    }

    return `${parts[1]}/${parts[2]}`;
}

function getReportIntroLines(dateId) {
    const monthDay =
        formatReportMonthDay(
            dateId
        );

    return [
        `[교재팀] 일일보고(${monthDay})`,
        "",
        "안녕하세요? 교재팀 김정우입니다.",
        "",
        "교재팀 일일보고 드립니다.",
        ""
    ];
}

function createPlainTextReport(report) {
    const shipping =
        normalizeStoredTextbookShipping(
            report?.textbookShipping
        );

    const events =
        Array.isArray(report?.events)
            ? sortEventRowsByOrders(
                report.events
            )
            : [];

    const reservations =
        Array.isArray(report?.reservations)
            ? sortEventRowsByOrders(
                report.reservations
            )
            : [];

    const workItems =
        Array.isArray(report?.workItems)
            ? report.workItems
            : [];

    let sectionNumber = 1;
    const lines =
        getReportIntroLines(
            report?.id
        );

    lines.push(
        `${sectionNumber++}. 교재 발송`
    );

    textbookShippingDetailLines(
        shipping
    ).forEach((line) => {
        lines.push(
            String(line || "").trim()
        );
    });

    if (events.length) {
        lines.push("");
        lines.push(
            `${sectionNumber++}. 이벤트 경품 발송`
        );

        events.forEach((item) => {
            lines.push(
                `- ${eventReportText(item).trim()}`
            );
        });
    }

    if (reservations.length) {
        lines.push("");
        lines.push(
            `${sectionNumber++}. 예약판매 교재 발송`
        );

        reservations.forEach((item) => {
            lines.push(
                `- ${reservationReportText(item).trim()}`
            );
        });
    }

    if (workItems.length) {
        lines.push("");
        lines.push(
            `${sectionNumber++}. 업무 내용 및 기안 상신`
        );

        workItems.forEach((item) => {
            const content =
                String(
                    item?.content || ""
                ).trim();

            if (content) {
                lines.push(
                    `- ${content}`
                );
            }
        });
    }

    return lines.join("\n").trim();
}

function createHtmlReport(report) {
    const shipping =
        normalizeStoredTextbookShipping(
            report?.textbookShipping
        );

    const events =
        Array.isArray(report?.events)
            ? sortEventRowsByOrders(
                report.events
            )
            : [];

    const reservations =
        Array.isArray(report?.reservations)
            ? sortEventRowsByOrders(
                report.reservations
            )
            : [];

    const workItems =
        Array.isArray(report?.workItems)
            ? report.workItems
            : [];

    let sectionNumber = 1;
    const blocks = [];

    const monthDay =
        formatReportMonthDay(
            report?.id
        );

    blocks.push(
        `<div><strong>[교재팀] 일일보고(${escapeHtml(monthDay)})</strong></div>`
    );
    blocks.push("<div><br></div>");
    blocks.push(
        "<div>안녕하세요? 교재팀 김정우입니다.</div>"
    );
    blocks.push("<div><br></div>");
    blocks.push(
        "<div>교재팀 일일보고 드립니다.</div>"
    );
    blocks.push("<div><br></div>");

    blocks.push(
        `<div><strong>${sectionNumber++}. 교재 발송</strong></div>`
    );

    textbookShippingDetailLines(
        shipping
    ).forEach((line) => {
        blocks.push(
            `<div>${escapeHtml(
                String(line || "").trim()
            )}</div>`
        );
    });

    if (events.length) {
        blocks.push("<div><br></div>");

        blocks.push(
            `<div><strong>${sectionNumber++}. 이벤트 경품 발송</strong></div>`
        );

        events.forEach((item) => {
            blocks.push(
                `<div>- ${escapeHtml(
                    eventReportText(item).trim()
                )}</div>`
            );
        });
    }

    if (reservations.length) {
        blocks.push("<div><br></div>");

        blocks.push(
            `<div><strong>${sectionNumber++}. 예약판매 교재 발송</strong></div>`
        );

        reservations.forEach((item) => {
            blocks.push(
                `<div>- ${escapeHtml(
                    reservationReportText(item).trim()
                )}</div>`
            );
        });
    }

    if (workItems.length) {
        blocks.push("<div><br></div>");

        blocks.push(
            `<div><strong>${sectionNumber++}. 업무 내용 및 기안 상신</strong></div>`
        );

        workItems.forEach((item) => {
            const content =
                String(
                    item?.content || ""
                ).trim();

            if (content) {
                blocks.push(
                    `<div>- ${escapeHtml(content)}</div>`
                );
            }
        });
    }

    return blocks.join("");
}

function reportCardMarkup(report) {
    const shipping =
        normalizeStoredTextbookShipping(
            report?.textbookShipping
        );

    const events =
        Array.isArray(report?.events)
            ? sortEventRowsByOrders(
                report.events
            )
            : [];

    const reservations =
        Array.isArray(report?.reservations)
            ? sortEventRowsByOrders(
                report.reservations
            )
            : [];

    const workItems =
        Array.isArray(report?.workItems)
            ? report.workItems
            : [];

    let sectionNumber = 1;
    const sections = [];

    sections.push(`
        <section>
            <h3>${sectionNumber++}. 교재 발송</h3>

            ${textbookShippingDetailLines(shipping)
                .map((line) => `
                    <p>${escapeHtml(line)}</p>
                `)
                .join("")}
        </section>
    `);

    if (events.length) {
        sections.push(`
            <section>
                <h3>${sectionNumber++}. 이벤트 경품 발송</h3>

                ${events
                    .map((item) => `
                        <p>- ${escapeHtml(eventReportText(item))}</p>
                    `)
                    .join("")}
            </section>
        `);
    }

    if (reservations.length) {
        sections.push(`
            <section>
                <h3>${sectionNumber++}. 예약판매 교재 발송</h3>

                ${reservations
                    .map((item) => `
                        <p>- ${escapeHtml(reservationReportText(item))}</p>
                    `)
                    .join("")}
            </section>
        `);
    }

    if (workItems.length) {
        sections.push(`
            <section>
                <h3>${sectionNumber++}. 업무 내용 및 기안 상신</h3>

                ${workItems
                    .map((item) => `
                        <p class="daily-report-prewrap">- ${escapeHtml(String(item.content || "").trim())}</p>
                    `)
                    .join("")}
            </section>
        `);
    }

    return `
        <article class="daily-report-card">
            <div class="daily-report-card-head">
                <div>
                    <h2>${escapeHtml(report.id)}</h2>
                    <span>확정 일일보고</span>
                </div>

                <div class="daily-report-card-actions">
                    ${
                        isAdminUser
                            ? `
                                <button class="btn" type="button" data-action="edit-report" data-date="${escapeHtml(report.id)}">수정</button>
                                <button class="btn" type="button" data-action="delete-report" data-date="${escapeHtml(report.id)}">삭제</button>
                            `
                            : ""
                    }

                    <button
                        class="btn"
                        type="button"
                        data-action="plain-report"
                        data-date="${escapeHtml(report.id)}"
                    >
                        메일용 보기/복사
                    </button>
                </div>
            </div>

            <div class="daily-report-card-body">
                ${sections.join("")}
            </div>
        </article>
    `;
}

async function applyLatestShippingProgress(rows) {
    return Promise.all(
        rows.map(async (report) => {
            try {
                const latestRow =
                    await getDocumentRow(
                        "shippingProgress",
                        report.id
                    );

                if (!latestRow) {
                    return report;
                }

                return {
                    ...report,
                    textbookShipping:
                        calculateTextbookShipping(
                            latestRow
                        ),
                    shippingComparison:
                        latestRow?.comparison || null
                };
            } catch (error) {
                console.error(
                    "[daily-report:latest-shipping]",
                    report?.id,
                    error
                );

                return report;
            }
        })
    );
}

async function searchReports() {
    const startDate = document.getElementById("dailyReportStartDate").value;
    const endDate = document.getElementById("dailyReportEndDate").value;

    if (!startDate || !endDate) {
        setStatus("조회 시작일과 종료일을 입력해 주십시오.", true);
        return;
    }

    if (startDate > endDate) {
        setStatus("시작일은 종료일보다 늦을 수 없습니다.", true);
        return;
    }

    try {
        closeWeeklyReport();
        setStatus("일일보고와 최신 교재 발송 수치를 불러오고 있습니다.");

        const rows = await getCollectionRowsByDocumentIdRange(
            REPORT_COLLECTION,
            startDate,
            endDate
        );

        if (!active) {
            return;
        }

        const sortedRows = [...rows].sort((a, b) =>
            String(a.id).localeCompare(String(b.id))
        );

        const latestRows =
            await applyLatestShippingProgress(
                sortedRows
            );

        if (!active) {
            return;
        }

        loadedReports = latestRows;

        const container = document.getElementById("dailyReportResults");

        if (!latestRows.length) {
            loadedReports = [];

            container.innerHTML = `
                <div class="data-message">
                    조회 기간에 확정된 일일보고가 없습니다.
                </div>
            `;
            setStatus(`${startDate} ~ ${endDate}`);
            return;
        }

        container.innerHTML =
            latestRows
                .map(reportCardMarkup)
                .join("");

        setStatus(
            `${startDate} ~ ${endDate} · ${latestRows.length}건`
        );
    } catch (error) {
        console.error("[daily-report:search]", error);
        setStatus(
            "일일보고를 불러오지 못했습니다. Firestore 권한을 확인해 주십시오.",
            true
        );
    }
}

async function deleteFinalReport(dateId) {
    if (!isAdminUser) {
        return;
    }

    if (!window.confirm(
        `${dateId} 확정 일일보고를 삭제하시겠습니까?\n작성 중 개별 항목은 삭제되지 않습니다.`
    )) {
        return;
    }

    try {
        await deleteCollectionDocument(REPORT_COLLECTION, dateId);

        if (draftDate === dateId) {
            draftFinalized = false;
            renderDraftState();
        }

        await searchReports();
    } catch (error) {
        console.error("[daily-report:delete-final]", error);
        setStatus("확정 일일보고를 삭제하지 못했습니다.", true);
    }
}

function openPlainReport(dateId) {
    const report =
        loadedReports.find(
            (item) =>
                item.id === dateId
        );

    if (!report) {
        setStatus(
            "복사용 일일보고 내용을 찾지 못했습니다.",
            true
        );
        return;
    }

    const panel =
        document.getElementById(
            "dailyReportPlainPanel"
        );

    const textarea =
        document.getElementById(
            "dailyReportPlainText"
        );

    textarea.innerHTML =
        createHtmlReport(
            report
        );

    textarea.dataset.date =
        dateId;

    panel.hidden = false;
}

function closePlainReport() {
    const panel =
        document.getElementById(
            "dailyReportPlainPanel"
        );

    if (panel) {
        panel.hidden = true;
    }
}

async function copyPlainReport() {
    const preview =
        document.getElementById(
            "dailyReportPlainText"
        );

    const dateId =
        preview?.dataset?.date || "";

    const report =
        loadedReports.find(
            (item) =>
                item.id === dateId
        );

    if (!report) {
        return;
    }

    const text =
        createPlainTextReport(
            report
        );

    const html =
        createHtmlReport(
            report
        );

    try {
        if (
            navigator.clipboard
            && typeof ClipboardItem !== "undefined"
        ) {
            const item =
                new ClipboardItem({
                    "text/plain":
                        new Blob(
                            [text],
                            {
                                type:
                                    "text/plain"
                            }
                        ),

                    "text/html":
                        new Blob(
                            [html],
                            {
                                type:
                                    "text/html"
                            }
                        )
                });

            await navigator.clipboard.write([
                item
            ]);
        } else {
            await navigator.clipboard.writeText(
                text
            );
        }

        setStatus(
            "메일용 내용을 복사했습니다. 메일 기본 글꼴을 유지하고 항목 제목만 굵게 붙여넣습니다."
        );
    } catch (error) {
        console.error(
            "[daily-report:copy-plain]",
            error
        );

        setStatus(
            "자동 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해 주십시오.",
            true
        );
    }
}

function bindEvents() {
    document.getElementById("dailyReportSearch").addEventListener("click", searchReports);
    document.getElementById("dailyReportOpenComposer").addEventListener("click", () => {
        void openComposer(todayId());
    });
    document.getElementById("dailyReportOpenWeekly").addEventListener("click", openWeeklyReport);
    document.getElementById("dailyReportCloseComposer").addEventListener("click", closeComposer);
    document.getElementById("dailyReportDraftDate").addEventListener("change", (event) => {
        if (event.target.value) {
            void openComposer(event.target.value);
        }
    });
    document.getElementById("dailyReportEventSave").addEventListener("click", saveEvent);
    document.getElementById("dailyReportEventCancel").addEventListener("click", resetEventForm);
    document.getElementById("dailyReportReservationSave").addEventListener("click", saveReservation);
    document.getElementById("dailyReportReservationCancel").addEventListener("click", resetReservationForm);
    document.getElementById("dailyReportWorkSave").addEventListener("click", saveWork);
    document.getElementById("dailyReportWorkCancel").addEventListener("click", resetWorkForm);
    document.getElementById("dailyReportFinalize").addEventListener("click", finalizeReport);
    document.getElementById("dailyReportWeeklyClose").addEventListener("click", closeWeeklyReport);
    document.getElementById("dailyReportWeeklyCopy").addEventListener("click", () => {
        void copyWeeklyReport();
    });
    document.getElementById("dailyReportPlainClose").addEventListener("click", closePlainReport);
    document.getElementById("dailyReportPlainCopy").addEventListener("click", () => {
        void copyPlainReport();
    });

    document.getElementById("dailyReportEventList").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        if (button.dataset.action === "edit-event") {
            startEventEdit(button.dataset.id);
        }

        if (button.dataset.action === "delete-event") {
            void deleteEvent(button.dataset.id);
        }
    });

    document.getElementById("dailyReportReservationList").addEventListener("click", (event) => {
        const button =
            event.target.closest(
                "button[data-action]"
            );

        if (!button) {
            return;
        }

        if (
            button.dataset.action
            === "edit-reservation"
        ) {
            startReservationEdit(
                button.dataset.id
            );
        }

        if (
            button.dataset.action
            === "delete-reservation"
        ) {
            void deleteReservation(
                button.dataset.id
            );
        }
    });

    document.getElementById("dailyReportWorkList").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        if (button.dataset.action === "edit-work") {
            startWorkEdit(button.dataset.id);
        }

        if (button.dataset.action === "delete-work") {
            void deleteWork(button.dataset.id);
        }
    });

    document.getElementById("dailyReportResults").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        if (button.dataset.action === "edit-report") {
            void openComposer(button.dataset.date);
        }

        if (button.dataset.action === "delete-report") {
            void deleteFinalReport(button.dataset.date);
        }

        if (button.dataset.action === "plain-report") {
            openPlainReport(button.dataset.date);
        }
    });
}

export async function mount({ content, actions, accessControl }) {
    active = true;
    isAdminUser = accessControl?.role === "admin";

    actions.innerHTML = createActionsMarkup();
    content.innerHTML = createMarkup();

    const today = todayId();
    document.getElementById("dailyReportStartDate").value = today;
    document.getElementById("dailyReportEndDate").value = today;

    bindEvents();
    await searchReports();
}

export function unmount() {
    active = false;
    stopDraftSubscriptions();
    eventRows = [];
    reservationRows = [];
    workRows = [];
    draftDate = "";
    draftFinalized = false;
    editingEventId = null;
    editingReservationId = null;
    editingWorkId = null;
    loadedReports = [];
}
