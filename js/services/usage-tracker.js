// /js/services/usage-tracker.js

import {
    doc,
    increment,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase.js";

const COLLECTION_NAME = "firestore_usage_daily";
const STORAGE_PREFIX = "firestoreUsagePending";
const FLUSH_INTERVAL_MS = 15 * 60 * 1000;

const ROUTE_FIELD_MAP = {
    auth: "auth_reads",
    dashboard: "dashboard_reads",
    "shipping-statistics": "shipping_statistics_reads",
    "instructor-sales": "instructor_sales_reads",
    "monthly-statistics": "monthly_statistics_reads",
    "firestore-usage": "firestore_usage_reads"
};

let currentUser = null;
let currentRoute = "auth";
let flushTimer = null;
let flushInProgress = false;

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function storageKey(uid, date) {
    return `${STORAGE_PREFIX}:${uid}:${date}`;
}

function emptyPending(date) {
    return {
        date,
        auth_reads: 0,
        dashboard_reads: 0,
        shipping_statistics_reads: 0,
        instructor_sales_reads: 0,
        monthly_statistics_reads: 0,
        firestore_usage_reads: 0,
        other_reads: 0,
        total_reads: 0,
        session_count: 0
    };
}

function readPending(uid, date) {
    const key = storageKey(uid, date);

    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return emptyPending(date);
        }

        return {
            ...emptyPending(date),
            ...JSON.parse(raw),
            date
        };
    } catch (error) {
        console.error("[usage-tracker:readPending]", error);
        return emptyPending(date);
    }
}

function writePending(uid, date, pending) {
    try {
        localStorage.setItem(
            storageKey(uid, date),
            JSON.stringify(pending)
        );
    } catch (error) {
        console.error("[usage-tracker:writePending]", error);
    }
}

function removePending(uid, date) {
    try {
        localStorage.removeItem(storageKey(uid, date));
    } catch (error) {
        console.error("[usage-tracker:removePending]", error);
    }
}

function getPendingDates(uid) {
    const prefix = `${STORAGE_PREFIX}:${uid}:`;
    const dates = [];

    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || !key.startsWith(prefix)) {
                continue;
            }

            dates.push(key.slice(prefix.length));
        }
    } catch (error) {
        console.error("[usage-tracker:getPendingDates]", error);
    }

    return dates.sort();
}

function hasPendingUsage(pending) {
    return Number(pending.total_reads || 0) > 0
        || Number(pending.session_count || 0) > 0;
}

export function initializeUsageTracking(user) {
    if (!user?.uid) {
        return;
    }

    const sameUser = currentUser?.uid === user.uid;

    currentUser = {
        uid: user.uid,
        email: user.email || ""
    };
    currentRoute = "auth";

    if (!sameUser) {
        const today = getLocalDateString();
        const pending = readPending(user.uid, today);
        pending.session_count = Number(pending.session_count || 0) + 1;
        writePending(user.uid, today, pending);
    }

    if (!flushTimer) {
        flushTimer = window.setInterval(() => {
            void flushUsageNow().catch((error) => {
                console.error("[usage-tracker:interval]", error);
            });
        }, FLUSH_INTERVAL_MS);
    }
}

export function stopUsageTracking() {
    if (flushTimer) {
        window.clearInterval(flushTimer);
        flushTimer = null;
    }

    currentUser = null;
    currentRoute = "auth";
}

export function setUsageRoute(routeName) {
    currentRoute = String(routeName || "").trim() || "other";
}

export function recordFirestoreReads(count) {
    if (!currentUser?.uid) {
        return;
    }

    const readCount = Math.max(0, Number(count) || 0);
    if (readCount <= 0) {
        return;
    }

    const date = getLocalDateString();
    const pending = readPending(currentUser.uid, date);
    const field = ROUTE_FIELD_MAP[currentRoute] || "other_reads";

    pending[field] = Number(pending[field] || 0) + readCount;
    pending.total_reads = Number(pending.total_reads || 0) + readCount;

    writePending(currentUser.uid, date, pending);
}

async function flushOneDate(date) {
    if (!currentUser?.uid) {
        return;
    }

    const pending = readPending(currentUser.uid, date);
    if (!hasPendingUsage(pending)) {
        removePending(currentUser.uid, date);
        return;
    }

    const documentId = `${date}_${currentUser.uid}`;

    const payload = {
        date,
        uid: currentUser.uid,
        email: currentUser.email,
        auth_reads: increment(Number(pending.auth_reads || 0)),
        dashboard_reads: increment(Number(pending.dashboard_reads || 0)),
        shipping_statistics_reads: increment(
            Number(pending.shipping_statistics_reads || 0)
        ),
        instructor_sales_reads: increment(
            Number(pending.instructor_sales_reads || 0)
        ),
        monthly_statistics_reads: increment(
            Number(pending.monthly_statistics_reads || 0)
        ),
        firestore_usage_reads: increment(
            Number(pending.firestore_usage_reads || 0)
        ),
        other_reads: increment(Number(pending.other_reads || 0)),
        total_reads: increment(Number(pending.total_reads || 0)),
        session_count: increment(Number(pending.session_count || 0)),
        last_synced_at: serverTimestamp()
    };

    removePending(currentUser.uid, date);

    try {
        await setDoc(
            doc(db, COLLECTION_NAME, documentId),
            payload,
            { merge: true }
        );
    } catch (error) {
        const currentPending = readPending(currentUser.uid, date);
        [
            "auth_reads",
            "dashboard_reads",
            "shipping_statistics_reads",
            "instructor_sales_reads",
            "monthly_statistics_reads",
            "firestore_usage_reads",
            "other_reads",
            "total_reads",
            "session_count"
        ].forEach((field) => {
            currentPending[field] =
                Number(currentPending[field] || 0)
                + Number(pending[field] || 0);
        });

        writePending(currentUser.uid, date, currentPending);
        throw error;
    }
}

export async function flushUsageNow() {
    if (!currentUser?.uid || flushInProgress) {
        return;
    }

    flushInProgress = true;

    try {
        const dates = getPendingDates(currentUser.uid);
        for (const date of dates) {
            await flushOneDate(date);
        }
    } catch (error) {
        console.error("[usage-tracker:flush]", error);
        throw error;
    } finally {
        flushInProgress = false;
    }
}
