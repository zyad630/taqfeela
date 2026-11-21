
function getConfiguredTimezoneMode() {
  try {
    const mode = typeof window !== 'undefined' && window.__posSettingsRef?.timezone_mode;
    if (mode && typeof mode === 'string' && mode.trim()) {
      return mode.trim();
    }
  } catch (_) {}
  return 'auto';
}

export function isEgyptDST(d = new Date()) {
  try {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const year = dateObj.getUTCFullYear();

    // 1. Egypt DST starts at 00:00 on the last Friday of April (Cairo UTC+2 -> Thursday 22:00 UTC)
    const april30Day = new Date(Date.UTC(year, 3, 30)).getUTCDay();
    const lastFridayApril = 30 - ((april30Day - 5 + 7) % 7);
    const dstStart = new Date(Date.UTC(year, 3, lastFridayApril - 1, 22, 0, 0));

    // 2. Egypt DST ends at 24:00 on the last Thursday of October (Cairo UTC+3 -> Thursday 21:00 UTC)
    const oct31Day = new Date(Date.UTC(year, 9, 31)).getUTCDay();
    const lastThursdayOct = 31 - ((oct31Day - 4 + 7) % 7);
    const dstEnd = new Date(Date.UTC(year, 9, lastThursdayOct, 21, 0, 0));

    const utcTime = dateObj.getTime();
    return utcTime >= dstStart.getTime() && utcTime < dstEnd.getTime();
  } catch {
    return false;
  }
}

export const toCairoDate = (dateInput) => {
  if (!dateInput) return null;
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const offsetHours = isEgyptDST(d) ? 3 : 2;
  return new Date(d.getTime() + offsetHours * 3600000);
};

function getDatePartsInActiveTimezone(dateInput) {
  if (!dateInput) return null;
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const tzMode = getConfiguredTimezoneMode();
  if (tzMode === 'Africa/Cairo') {
    const cairo = toCairoDate(d);
    if (!cairo) return null;
    return {
      year: String(cairo.getUTCFullYear()),
      month: String(cairo.getUTCMonth() + 1).padStart(2, '0'),
      day: String(cairo.getUTCDate()).padStart(2, '0'),
      hour: cairo.getUTCHours(),
      minute: cairo.getUTCMinutes()
    };
  }

  try {
    const opts = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    };
    if (tzMode && tzMode !== 'auto' && tzMode !== 'local') {
      opts.timeZone = tzMode;
    }
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hourRaw = Number(parts.find(p => p.type === 'hour')?.value);
    const minuteRaw = Number(parts.find(p => p.type === 'minute')?.value);
    if (year && month && day && !Number.isNaN(hourRaw) && !Number.isNaN(minuteRaw)) {
      return {
        year,
        month,
        day,
        hour: hourRaw % 24,
        minute: minuteRaw
      };
    }
  } catch (_) {}

  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
    hour: d.getHours(),
    minute: d.getMinutes()
  };
}

export const getLocalDateString = (d = new Date()) => {
  try {
    const p = getDatePartsInActiveTimezone(d);
    if (!p) return '';
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return '';
  }
};

export const formatShiftTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const p = getDatePartsInActiveTimezone(dateStr);
    if (!p) return String(dateStr).slice(11, 16);
    const h = p.hour;
    const m = String(p.minute).padStart(2, '0');
    const period = h >= 12 ? 'م' : 'ص';
    const h12 = String(h % 12 || 12).padStart(2, '0');
    return `${h12}:${m} ${period}`;
  } catch {
    return String(dateStr).slice(11, 16);
  }
};

export function formatCairoTime(dateStr) {
  return formatShiftTime(dateStr);
}

export const formatCairoDateTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const datePart = getLocalDateString(dateStr);
    const timePart = formatShiftTime(dateStr);
    return `${datePart} ${timePart}`;
  } catch {
    return String(dateStr);
  }
};

export const getShiftDisplayName = (s) => {
  if (!s) return 'وردية';
  let name = s.shift_type || '';
  if (!name || name.trim() === '' || name === 'اليومية') {
    if (s.opened_at) {
      try {
        const p = getDatePartsInActiveTimezone(s.opened_at);
        const hour = p ? p.hour : 0;
        if (hour >= 5 && hour < 14) name = 'الوردية الصباحية ☀️';
        else if (hour >= 14 && hour < 22) name = 'الوردية المسائية 🌆';
        else name = 'الوردية الليلية 🌙';
      } catch {
        name = 'الوردية الصباحية ☀️';
      }
    } else {
      name = 'وردية العمل';
    }
  } else {
    if (name.includes('صباح') && !name.includes('☀️')) name += ' ☀️';
    else if (name.includes('مساء') && !name.includes('🌆')) name += ' 🌆';
    else if (name.includes('ليل') && !name.includes('🌙')) name += ' 🌙';
  }
  return name;
};
