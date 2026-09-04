export function padNumber(value) {
    return String(value).padStart(2, "0");
}

export function dateToId(date) {
    return [
        date.getFullYear(),
        padNumber(date.getMonth() + 1),
        padNumber(date.getDate())
    ].join("-");
}

export function parseDateId(dateId) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateId));
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return date;
}

export function addDays(date, numberOfDays) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + numberOfDays);
    return result;
}

export function getDateRange(startDateId, endDateId) {
    const start = parseDateId(startDateId);
    const end = parseDateId(endDateId);
    if (!start || !end || start > end) {
        return [];
    }

    const ids = [];
    for (let current = start; current <= end; current = addDays(current, 1)) {
        ids.push(dateToId(current));
    }
    return ids;
}

export function getPreviousYearDateId(dateId) {
    const date = parseDateId(dateId);
    if (!date) {
        return "";
    }

    const previousYear = date.getFullYear() - 1;
    if (date.getMonth() === 1 && date.getDate() === 29) {
        return `${previousYear}-02-28`;
    }
    return `${previousYear}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function formatFullDate(dateId) {
    const date = parseDateId(dateId);
    return date
        ? `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
        : String(dateId);
}

export function formatChartDate(dateId) {
    const date = parseDateId(dateId);
    return date ? `${date.getMonth() + 1}.${date.getDate()}` : String(dateId);
}

export function getMonthBounds(monthId) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthId));
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const lastDay = new Date(year, month, 0).getDate();
    return {
        start: `${year}-${padNumber(month)}-01`,
        end: `${year}-${padNumber(month)}-${padNumber(lastDay)}`
    };
}
