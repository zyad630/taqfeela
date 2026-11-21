// Universal API Bridge: Uses Electron IPC when available, or rich local storage fallback in browser
import bcrypt from 'bcryptjs';

// Password hashing & comparison helpers for mockApi / browser storage
function hashPassword(plainText) {
  if (!plainText) return '';
  return bcrypt.hashSync(String(plainText).trim(), 10);
}

function verifyPassword(plainText, hashedPassword) {
  if (!plainText || !hashedPassword) return false;
  const cleanPass = String(plainText).trim();
  // Disallow old plaintext passwords completely
  if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$')) {
    try {
      return bcrypt.compareSync(cleanPass, hashedPassword);
    } catch (_) {
      return false;
    }
  }
  return false;
}

// === Cairo timezone helpers (needed for date-based report filtering) ===
function isEgyptDST(d = new Date()) {
  try {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const year = dateObj.getUTCFullYear();
    const lastDayApril = new Date(Date.UTC(year, 3, 30, 22, 0, 0));
    const aprilWeekday = lastDayApril.getUTCDay();
    const daysBackToFriday = (aprilWeekday - 5 + 7) % 7;
    const dstStart = new Date(lastDayApril.getTime() - daysBackToFriday * 86400000);
    const lastDayOct = new Date(Date.UTC(year, 9, 31, 21, 0, 0));
    const octWeekday = lastDayOct.getUTCDay();
    const daysBackToOctThu = (octWeekday - 4 + 7) % 7;
    const dstEnd = new Date(lastDayOct.getTime() - daysBackToOctThu * 86400000);
    const utcTime = dateObj.getTime();
    return utcTime >= dstStart.getTime() && utcTime < dstEnd.getTime();
  } catch {
    return false;
  }
}

function toCairoDate(dateInput) {
  if (!dateInput) return null;
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const offsetHours = isEgyptDST(d) ? 3 : 2;
  return new Date(d.getTime() + offsetHours * 3600000);
}

function getLocalDateString(d = new Date()) {
  try {
    const cairo = toCairoDate(d);
    if (!cairo) return '';
    const y = cairo.getUTCFullYear();
    const m = String(cairo.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cairo.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

const DEFAULT_CATEGORIES = [
  {
    "id": 1,
    "name": "جوبلت كوكيز",
    "icon": "🍪",
    "sort_order": 1
  },
  {
    "id": 2,
    "name": "حلويات",
    "icon": "🍰",
    "sort_order": 2
  },
  {
    "id": 3,
    "name": "وافلز",
    "icon": "🧇",
    "sort_order": 3
  },
  {
    "id": 4,
    "name": "سموزي",
    "icon": "🥤",
    "sort_order": 4
  },
  {
    "id": 5,
    "name": "موهيتو",
    "icon": "🍹",
    "sort_order": 5
  },
  {
    "id": 6,
    "name": "بان كيك",
    "icon": "🥞",
    "sort_order": 6
  },
  {
    "id": 7,
    "name": "سوفت درينك",
    "icon": "🥫",
    "sort_order": 7
  },
  {
    "id": 8,
    "name": "زبادو",
    "icon": "🥛",
    "sort_order": 8
  },
  {
    "id": 9,
    "name": "شيشة",
    "icon": "💨",
    "sort_order": 9
  },
  {
    "id": 10,
    "name": "إضافات",
    "icon": "➕",
    "sort_order": 10
  },
  {
    "id": 11,
    "name": "مشروبات ساخنة",
    "icon": "☕",
    "sort_order": 11
  },
  {
    "id": 12,
    "name": "هوت شوكلت",
    "icon": "🍫",
    "sort_order": 12
  },
  {
    "id": 13,
    "name": "ميلك تشيك",
    "icon": "🍦",
    "sort_order": 13
  },
  {
    "id": 14,
    "name": "عصائر فريش",
    "icon": "🍊",
    "sort_order": 14
  },
  {
    "id": 15,
    "name": "كوكتيلات",
    "icon": "🍸",
    "sort_order": 15
  },
  {
    "id": 16,
    "name": "فرابيه",
    "icon": "🥤",
    "sort_order": 16
  },
  {
    "id": 17,
    "name": "ايس كوفي",
    "icon": "🧊",
    "sort_order": 17
  }
];

const DEFAULT_PRODUCTS = [
  {
    "id": 1,
    "name": "جوبلت كوكيز صوص (نوتيلا - كندر - لوتس - كراميل - وايت شوكلت)",
    "price": 70,
    "cost": 25,
    "category_id": 1,
    "stock_qty": 100
  },
  {
    "id": 2,
    "name": "جوبلت كوكيز هاف و هاف (2 صوص من اختيارك)",
    "price": 80,
    "cost": 28,
    "category_id": 1,
    "stock_qty": 100
  },
  {
    "id": 3,
    "name": "جوبلت بستاشيو",
    "price": 95,
    "cost": 35,
    "category_id": 1,
    "stock_qty": 80
  },
  {
    "id": 4,
    "name": "جوبلت أبل باي",
    "price": 70,
    "cost": 25,
    "category_id": 1,
    "stock_qty": 80
  },
  {
    "id": 5,
    "name": "جوبلت بانانا باي",
    "price": 70,
    "cost": 25,
    "category_id": 1,
    "stock_qty": 80
  },
  {
    "id": 6,
    "name": "أم علي مكسرات",
    "price": 60,
    "cost": 20,
    "category_id": 2,
    "stock_qty": 60
  },
  {
    "id": 7,
    "name": "أم علي فواكه",
    "price": 70,
    "cost": 25,
    "category_id": 2,
    "stock_qty": 60
  },
  {
    "id": 8,
    "name": "تشيز كيك صوص (نوتيلا - لوتس - كراميل - دارك - وايت)",
    "price": 70,
    "cost": 25,
    "category_id": 2,
    "stock_qty": 50
  },
  {
    "id": 9,
    "name": "تشيز كيك بستاشيو",
    "price": 90,
    "cost": 35,
    "category_id": 2,
    "stock_qty": 40
  },
  {
    "id": 10,
    "name": "مولتن كيك",
    "price": 80,
    "cost": 28,
    "category_id": 2,
    "stock_qty": 50
  },
  {
    "id": 11,
    "name": "سينابون صوص (نوتيلا - لوتس - كراميل - دارك - وايت)",
    "price": 70,
    "cost": 24,
    "category_id": 2,
    "stock_qty": 50
  },
  {
    "id": 12,
    "name": "سينابون بستاشيو",
    "price": 90,
    "cost": 32,
    "category_id": 2,
    "stock_qty": 40
  },
  {
    "id": 13,
    "name": "فادج كيك",
    "price": 70,
    "cost": 24,
    "category_id": 2,
    "stock_qty": 50
  },
  {
    "id": 14,
    "name": "فروت سلاد",
    "price": 70,
    "cost": 22,
    "category_id": 2,
    "stock_qty": 60
  },
  {
    "id": 15,
    "name": "وافلز (نوتيلا - لوتس - وايت - كراميل - دارك - كندر)",
    "price": 60,
    "cost": 20,
    "category_id": 3,
    "stock_qty": 80
  },
  {
    "id": 16,
    "name": "وافلز هاف و هاف (ميكس نوعين صوص)",
    "price": 75,
    "cost": 25,
    "category_id": 3,
    "stock_qty": 80
  },
  {
    "id": 17,
    "name": "وافلز بستاشيو",
    "price": 90,
    "cost": 32,
    "category_id": 3,
    "stock_qty": 60
  },
  {
    "id": 18,
    "name": "وافلز فواكه",
    "price": 80,
    "cost": 28,
    "category_id": 3,
    "stock_qty": 60
  },
  {
    "id": 19,
    "name": "وافلز أبل باي",
    "price": 75,
    "cost": 25,
    "category_id": 3,
    "stock_qty": 60
  },
  {
    "id": 20,
    "name": "وافلز بانانا باي",
    "price": 75,
    "cost": 25,
    "category_id": 3,
    "stock_qty": 60
  },
  {
    "id": 21,
    "name": "سموزي نكهات (فراولة - ميكس بيري - برتقال - بطيخ - باشون فروت - أناناس - جوافة)",
    "price": 65,
    "cost": 20,
    "category_id": 4,
    "stock_qty": 100
  },
  {
    "id": 22,
    "name": "كولا كريز",
    "price": 65,
    "cost": 18,
    "category_id": 4,
    "stock_qty": 90
  },
  {
    "id": 23,
    "name": "ليمون برتقال سموزي",
    "price": 65,
    "cost": 18,
    "category_id": 4,
    "stock_qty": 90
  },
  {
    "id": 24,
    "name": "ليمون نعناع سموزي",
    "price": 60,
    "cost": 15,
    "category_id": 4,
    "stock_qty": 100
  },
  {
    "id": 25,
    "name": "موهيتو كلاسيك",
    "price": 50,
    "cost": 15,
    "category_id": 5,
    "stock_qty": 100
  },
  {
    "id": 26,
    "name": "موهيتو فليفر (بلوبيري - فراولة - باشون فروت - مانجا - أناناس - كريز)",
    "price": 65,
    "cost": 20,
    "category_id": 5,
    "stock_qty": 100
  },
  {
    "id": 27,
    "name": "موهيتو ريدبول",
    "price": 90,
    "cost": 45,
    "category_id": 5,
    "stock_qty": 70
  },
  {
    "id": 28,
    "name": "موهيتو جيلي كولا",
    "price": 70,
    "cost": 22,
    "category_id": 5,
    "stock_qty": 80
  },
  {
    "id": 29,
    "name": "بان كيك 12 قطعة (نوتيلا - لوتس - كراميل - دارك - كندر)",
    "price": 60,
    "cost": 20,
    "category_id": 6,
    "stock_qty": 80
  },
  {
    "id": 30,
    "name": "بان كيك 12 قطعة هاف و هاف (ميكس صوص من اختيارك)",
    "price": 70,
    "cost": 24,
    "category_id": 6,
    "stock_qty": 80
  },
  {
    "id": 31,
    "name": "بان كيك 12 قطعة بستاشيو",
    "price": 80,
    "cost": 28,
    "category_id": 6,
    "stock_qty": 70
  },
  {
    "id": 32,
    "name": "بان كيك 24 قطعة (نوتيلا - لوتس - كراميل - دارك - كندر)",
    "price": 90,
    "cost": 30,
    "category_id": 6,
    "stock_qty": 70
  },
  {
    "id": 33,
    "name": "بان كيك 24 قطعة هاف و هاف (ميكس صوص من اختيارك)",
    "price": 100,
    "cost": 35,
    "category_id": 6,
    "stock_qty": 70
  },
  {
    "id": 34,
    "name": "بان كيك 24 قطعة بستاشيو",
    "price": 110,
    "cost": 40,
    "category_id": 6,
    "stock_qty": 60
  },
  {
    "id": 35,
    "name": "كولا",
    "price": 30,
    "cost": 18,
    "category_id": 7,
    "stock_qty": 150
  },
  {
    "id": 36,
    "name": "فيروز",
    "price": 35,
    "cost": 20,
    "category_id": 7,
    "stock_qty": 120
  },
  {
    "id": 37,
    "name": "بريل",
    "price": 35,
    "cost": 20,
    "category_id": 7,
    "stock_qty": 100
  },
  {
    "id": 38,
    "name": "جولد",
    "price": 35,
    "cost": 20,
    "category_id": 7,
    "stock_qty": 100
  },
  {
    "id": 39,
    "name": "ريدبول",
    "price": 80,
    "cost": 45,
    "category_id": 7,
    "stock_qty": 80
  },
  {
    "id": 40,
    "name": "فيوري",
    "price": 35,
    "cost": 20,
    "category_id": 7,
    "stock_qty": 100
  },
  {
    "id": 41,
    "name": "استنج",
    "price": 35,
    "cost": 20,
    "category_id": 7,
    "stock_qty": 100
  },
  {
    "id": 42,
    "name": "مياه صغيرة",
    "price": 10,
    "cost": 4,
    "category_id": 7,
    "stock_qty": 250
  },
  {
    "id": 43,
    "name": "مياه كبيرة",
    "price": 15,
    "cost": 7,
    "category_id": 7,
    "stock_qty": 150
  },
  {
    "id": 44,
    "name": "زبادو عسل",
    "price": 45,
    "cost": 16,
    "category_id": 8,
    "stock_qty": 80
  },
  {
    "id": 45,
    "name": "زبادو فراولة",
    "price": 60,
    "cost": 20,
    "category_id": 8,
    "stock_qty": 80
  },
  {
    "id": 46,
    "name": "زبادو مانجا",
    "price": 60,
    "cost": 20,
    "category_id": 8,
    "stock_qty": 80
  },
  {
    "id": 47,
    "name": "زبادو موز",
    "price": 60,
    "cost": 20,
    "category_id": 8,
    "stock_qty": 80
  },
  {
    "id": 48,
    "name": "زبادو كيوي",
    "price": 70,
    "cost": 25,
    "category_id": 8,
    "stock_qty": 70
  },
  {
    "id": 49,
    "name": "زبادو أفوكادو",
    "price": 90,
    "cost": 35,
    "category_id": 8,
    "stock_qty": 60
  },
  {
    "id": 50,
    "name": "شيشة كلاسيك",
    "price": 25,
    "cost": 8,
    "category_id": 9,
    "stock_qty": 200
  },
  {
    "id": 51,
    "name": "شيشة فواكه",
    "price": 50,
    "cost": 15,
    "category_id": 9,
    "stock_qty": 150
  },
  {
    "id": 52,
    "name": "شيشة ميكس",
    "price": 55,
    "cost": 18,
    "category_id": 9,
    "stock_qty": 150
  },
  {
    "id": 53,
    "name": "شيشة مخصوص",
    "price": 65,
    "cost": 22,
    "category_id": 9,
    "stock_qty": 120
  },
  {
    "id": 54,
    "name": "إضافة ثلج",
    "price": 5,
    "cost": 1,
    "category_id": 10,
    "stock_qty": 500
  },
  {
    "id": 55,
    "name": "إضافة فليفر",
    "price": 10,
    "cost": 3,
    "category_id": 10,
    "stock_qty": 300
  },
  {
    "id": 56,
    "name": "إضافة حليب",
    "price": 10,
    "cost": 4,
    "category_id": 10,
    "stock_qty": 300
  },
  {
    "id": 57,
    "name": "بولة ايس كريم",
    "price": 20,
    "cost": 7,
    "category_id": 10,
    "stock_qty": 150
  },
  {
    "id": 58,
    "name": "مكسرات مخصوص",
    "price": 20,
    "cost": 8,
    "category_id": 10,
    "stock_qty": 150
  },
  {
    "id": 59,
    "name": "كريم شانتيه",
    "price": 10,
    "cost": 3,
    "category_id": 10,
    "stock_qty": 200
  },
  {
    "id": 60,
    "name": "إضافة فواكه",
    "price": 15,
    "cost": 5,
    "category_id": 10,
    "stock_qty": 200
  },
  {
    "id": 61,
    "name": "قهوة تركي سنجل",
    "price": 25,
    "cost": 7,
    "category_id": 11,
    "stock_qty": 250
  },
  {
    "id": 62,
    "name": "قهوة تركي دبل",
    "price": 40,
    "cost": 12,
    "category_id": 11,
    "stock_qty": 250
  },
  {
    "id": 63,
    "name": "اسبريسو سنجل",
    "price": 40,
    "cost": 12,
    "category_id": 11,
    "stock_qty": 200
  },
  {
    "id": 64,
    "name": "اسبريسو دبل",
    "price": 50,
    "cost": 18,
    "category_id": 11,
    "stock_qty": 200
  },
  {
    "id": 65,
    "name": "اسبريسو ميكاتو سنجل",
    "price": 45,
    "cost": 14,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 66,
    "name": "اسبريسو ميكاتو دبل",
    "price": 55,
    "cost": 19,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 67,
    "name": "كورتادو",
    "price": 55,
    "cost": 18,
    "category_id": 11,
    "stock_qty": 120
  },
  {
    "id": 68,
    "name": "كراميل ميكاتو (اسبريسو + حليب + فليفر فانيليا + صوص كراميل)",
    "price": 70,
    "cost": 24,
    "category_id": 11,
    "stock_qty": 120
  },
  {
    "id": 69,
    "name": "فلات وايت",
    "price": 60,
    "cost": 20,
    "category_id": 11,
    "stock_qty": 120
  },
  {
    "id": 70,
    "name": "لاتيه",
    "price": 60,
    "cost": 20,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 71,
    "name": "اسبانش لاتيه",
    "price": 65,
    "cost": 22,
    "category_id": 11,
    "stock_qty": 130
  },
  {
    "id": 72,
    "name": "بستاشيو لاتيه",
    "price": 75,
    "cost": 28,
    "category_id": 11,
    "stock_qty": 100
  },
  {
    "id": 73,
    "name": "كابتشينو",
    "price": 60,
    "cost": 20,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 74,
    "name": "امريكانو",
    "price": 60,
    "cost": 18,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 75,
    "name": "موكا (دارك - وايت)",
    "price": 65,
    "cost": 22,
    "category_id": 11,
    "stock_qty": 120
  },
  {
    "id": 76,
    "name": "ابل سيدر",
    "price": 45,
    "cost": 14,
    "category_id": 11,
    "stock_qty": 100
  },
  {
    "id": 77,
    "name": "فيتامين سي (برتقال + عسل + ليمون + جوافة)",
    "price": 60,
    "cost": 20,
    "category_id": 11,
    "stock_qty": 100
  },
  {
    "id": 78,
    "name": "شاي",
    "price": 15,
    "cost": 3,
    "category_id": 11,
    "stock_qty": 300
  },
  {
    "id": 79,
    "name": "شاي أخضر",
    "price": 20,
    "cost": 4,
    "category_id": 11,
    "stock_qty": 200
  },
  {
    "id": 80,
    "name": "سحلب مكسرات",
    "price": 45,
    "cost": 14,
    "category_id": 11,
    "stock_qty": 120
  },
  {
    "id": 81,
    "name": "سحلب فواكه",
    "price": 55,
    "cost": 18,
    "category_id": 11,
    "stock_qty": 100
  },
  {
    "id": 82,
    "name": "نسكافيه بلاك",
    "price": 40,
    "cost": 12,
    "category_id": 11,
    "stock_qty": 180
  },
  {
    "id": 83,
    "name": "نسكافيه حليب",
    "price": 50,
    "cost": 16,
    "category_id": 11,
    "stock_qty": 180
  },
  {
    "id": 84,
    "name": "كاكاو حليب",
    "price": 50,
    "cost": 16,
    "category_id": 11,
    "stock_qty": 150
  },
  {
    "id": 85,
    "name": "هوت شوكلت (نوتيلا - وايت - كندر)",
    "price": 60,
    "cost": 20,
    "category_id": 12,
    "stock_qty": 100
  },
  {
    "id": 86,
    "name": "هوت شوكلت دارك",
    "price": 55,
    "cost": 18,
    "category_id": 12,
    "stock_qty": 100
  },
  {
    "id": 87,
    "name": "هوت شوكلت مارشميلو",
    "price": 70,
    "cost": 24,
    "category_id": 12,
    "stock_qty": 80
  },
  {
    "id": 88,
    "name": "ميلك تشيك (شوكلت - فانيليا - فراولة - مانجا)",
    "price": 70,
    "cost": 22,
    "category_id": 13,
    "stock_qty": 100
  },
  {
    "id": 89,
    "name": "ميلك تشيك (بلوبيري - مكس بيري - بطيخ)",
    "price": 75,
    "cost": 25,
    "category_id": 13,
    "stock_qty": 90
  },
  {
    "id": 90,
    "name": "ميلك تشيك (نوتيلا - لوتس - كراميل - كندر)",
    "price": 75,
    "cost": 25,
    "category_id": 13,
    "stock_qty": 90
  },
  {
    "id": 91,
    "name": "ميلك تشيك بستاشيو",
    "price": 85,
    "cost": 30,
    "category_id": 13,
    "stock_qty": 80
  },
  {
    "id": 92,
    "name": "ميلك تشيك أوريو",
    "price": 75,
    "cost": 25,
    "category_id": 13,
    "stock_qty": 100
  },
  {
    "id": 93,
    "name": "عصير مانجو فريش",
    "price": 60,
    "cost": 20,
    "category_id": 14,
    "stock_qty": 120
  },
  {
    "id": 94,
    "name": "عصير فراولة فريش",
    "price": 55,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 120
  },
  {
    "id": 95,
    "name": "عصير فراولة حليب",
    "price": 60,
    "cost": 20,
    "category_id": 14,
    "stock_qty": 100
  },
  {
    "id": 96,
    "name": "عصير برتقال فريش",
    "price": 55,
    "cost": 16,
    "category_id": 14,
    "stock_qty": 120
  },
  {
    "id": 97,
    "name": "عصير جوافة فريش",
    "price": 50,
    "cost": 15,
    "category_id": 14,
    "stock_qty": 120
  },
  {
    "id": 98,
    "name": "عصير جوافة حليب",
    "price": 55,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 100
  },
  {
    "id": 99,
    "name": "عصير كانتلوب فريش",
    "price": 50,
    "cost": 15,
    "category_id": 14,
    "stock_qty": 100
  },
  {
    "id": 100,
    "name": "عصير كانتلوب حليب",
    "price": 55,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 90
  },
  {
    "id": 101,
    "name": "عصير أناناس فريش",
    "price": 50,
    "cost": 16,
    "category_id": 14,
    "stock_qty": 90
  },
  {
    "id": 102,
    "name": "عصير كيوي فريش",
    "price": 60,
    "cost": 20,
    "category_id": 14,
    "stock_qty": 90
  },
  {
    "id": 103,
    "name": "عصير بطيخ فريش",
    "price": 60,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 100
  },
  {
    "id": 104,
    "name": "موز حليب",
    "price": 60,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 110
  },
  {
    "id": 105,
    "name": "بلح حليب",
    "price": 60,
    "cost": 18,
    "category_id": 14,
    "stock_qty": 100
  },
  {
    "id": 106,
    "name": "أفوكادو حليب",
    "price": 80,
    "cost": 30,
    "category_id": 14,
    "stock_qty": 70
  },
  {
    "id": 107,
    "name": "عصير ليمون فريش",
    "price": 40,
    "cost": 10,
    "category_id": 14,
    "stock_qty": 150
  },
  {
    "id": 108,
    "name": "عصير ليمون نعناع فريش",
    "price": 45,
    "cost": 12,
    "category_id": 14,
    "stock_qty": 150
  },
  {
    "id": 109,
    "name": "كوكتيل مانجو فراولة",
    "price": 70,
    "cost": 22,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 110,
    "name": "كوكتيل مانجو كيوي",
    "price": 75,
    "cost": 25,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 111,
    "name": "كوكتيل خوخ مانجو",
    "price": 75,
    "cost": 25,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 112,
    "name": "كوكتيل جوافة موز",
    "price": 65,
    "cost": 20,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 113,
    "name": "كوكتيل جوافة نعناع",
    "price": 60,
    "cost": 18,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 114,
    "name": "با تنش بلانش (أناناس كيوي + برتقال + تفاح)",
    "price": 75,
    "cost": 25,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 115,
    "name": "سويت & سور (بطيخ كيوي + فراولة + ليمون)",
    "price": 70,
    "cost": 24,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 116,
    "name": "لافلى التكية (مكس توت + موز + فراولة + ايس كريم فانيليا)",
    "price": 75,
    "cost": 26,
    "category_id": 15,
    "stock_qty": 80
  },
  {
    "id": 117,
    "name": "جرين باور (أفوكادو + كيوي + مكسرات + عسل + حليب + ايس كريم فانيليا)",
    "price": 90,
    "cost": 35,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 118,
    "name": "بانانا جرين (موز + أفوكادو + لوز)",
    "price": 85,
    "cost": 30,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 119,
    "name": "باور التكية (موز + حليب + عسل + أفوكادو + مكسرات + قرفة + زبدة فول سوداني + بلح)",
    "price": 100,
    "cost": 40,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 120,
    "name": "جولد كيوي (أناناس كيوي + موز)",
    "price": 75,
    "cost": 25,
    "category_id": 15,
    "stock_qty": 70
  },
  {
    "id": 121,
    "name": "فرابتشينو كلاسيك",
    "price": 65,
    "cost": 20,
    "category_id": 16,
    "stock_qty": 80
  },
  {
    "id": 122,
    "name": "فرابتشينو فليفر (فانيليا - دارك - كراميل)",
    "price": 70,
    "cost": 23,
    "category_id": 16,
    "stock_qty": 80
  },
  {
    "id": 123,
    "name": "فرابيبه لوتس",
    "price": 70,
    "cost": 24,
    "category_id": 16,
    "stock_qty": 80
  },
  {
    "id": 124,
    "name": "فرابيبه كندر",
    "price": 70,
    "cost": 24,
    "category_id": 16,
    "stock_qty": 80
  },
  {
    "id": 125,
    "name": "ايس لاتيه",
    "price": 60,
    "cost": 20,
    "category_id": 17,
    "stock_qty": 100
  },
  {
    "id": 126,
    "name": "اسبانيش لاتيه بارد",
    "price": 70,
    "cost": 24,
    "category_id": 17,
    "stock_qty": 100
  },
  {
    "id": 127,
    "name": "ايس موكا (وايت - دارك)",
    "price": 70,
    "cost": 24,
    "category_id": 17,
    "stock_qty": 90
  },
  {
    "id": 128,
    "name": "ايس امريكانو",
    "price": 60,
    "cost": 18,
    "category_id": 17,
    "stock_qty": 100
  },
  {
    "id": 129,
    "name": "ايس كراميل ميكاتو",
    "price": 70,
    "cost": 24,
    "category_id": 17,
    "stock_qty": 90
  }
];

const DEFAULT_TABLES = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    number: `A${i + 1}`,
    name: `طاولة ${i + 1}`,
    capacity: i + 1 <= 2 ? 2 : 4,
    status: 'available',
    current_order_id: null,
    hall: 'أرضي'
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: i + 7,
    number: `U${i + 1}`,
    name: `طاولة ${i + 1}`,
    capacity: i + 1 <= 2 ? 2 : 4,
    status: 'available',
    current_order_id: null,
    hall: 'علوي'
  }))
];

const DEFAULT_USERS = [
  {
    id: 1,
    username: 'admin',
    name: 'مدير النظام',
    password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_001',
    role: 'admin',
    phone: '01000000000',
    salary: 6000,
    shift_name: 'جميع الأوقات',
    shift_start: '00:00',
    shift_end: '23:59',
    created_at: new Date().toISOString(),
    must_change_password: 1
  },
  {
    id: 101,
    username: 'manager',
    name: 'مدير النظام (احتياطي)',
    password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_002',
    role: 'admin',
    phone: '01000000000',
    salary: 6000,
    shift_name: 'جميع الأوقات',
    shift_start: '00:00',
    shift_end: '23:59',
    created_at: new Date().toISOString(),
    must_change_password: 1
  },
  {
    id: 2,
    username: 'cashier1',
    name: 'كاشير الفترة الصباحية',
    password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_003',
    role: 'cashier',
    phone: '01011111111',
    salary: 3500,
    shift_name: 'الشيفت الصباحي (الأول)',
    shift_start: '06:00',
    shift_end: '14:00',
    created_at: new Date().toISOString(),
    must_change_password: 1
  },
  {
    id: 3,
    username: 'cashier2',
    name: 'كاشير الفترة المسائية',
    password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_004',
    role: 'cashier',
    phone: '01022222222',
    salary: 3500,
    shift_name: 'الشيفت المسائي (الثاني)',
    shift_start: '14:00',
    shift_end: '22:00',
    created_at: new Date().toISOString(),
    must_change_password: 1
  },
  {
    id: 4,
    username: 'cashier3',
    name: 'كاشير الفترة الليلية',
    password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_005',
    role: 'cashier',
    phone: '01033333333',
    salary: 3500,
    shift_name: 'الشيفت الليلي (الثالث)',
    shift_start: '22:00',
    shift_end: '06:00',
    created_at: new Date().toISOString(),
    must_change_password: 1
  }
];

const DEFAULT_SETTINGS = {
  cafe_name: 'كافيه الرواد',
  cafe_address: 'وسط البلد - شارع الجمهورية',
  cafe_phone: '01012345678',
  receipt_footer: 'شكراً لزيارتكم ونتمنى لكم يوماً سعيداً ☕',
  currency: 'ج.م',
  allow_negative_stock: '0',
  silent_print: '0',
  printer_name: '',
  bar_printer_name: '',
  shisha_printer_name: 'شيشة',
  auto_print_receipt_on_checkout: '0',
  // Vendor / Developer Features (defaults)
  show_notebook_to_cashier: 'false',
  require_password_transfer_tables: 'false',
  allow_cashier_cancel_orders: 'false',
  show_stock_alert_on_order: 'false',
  enable_bar_order: 'true',
  enable_guest_check: 'true',
  enable_waiter_qr: 'false',
  shift_schedules: JSON.stringify([
    { id: 'shift_morning', name: 'الشيفت الصباحي', start: '06:00', end: '14:00', icon: '☀️' },
    { id: 'shift_evening', name: 'الشيفت المسائي', start: '14:00', end: '22:00', icon: '🌆' },
    { id: 'shift_night', name: 'الشيفت الليلي', start: '22:00', end: '06:00', icon: '🌙' }
  ])
};

// In-Memory / LocalStorage Mock fallback for Web with Disk Sync
let syncDebounceTimer = null;
const syncQueue = {};

async function pushSyncQueue() {
  if (typeof window === 'undefined' || !window.location || !window.location.protocol.startsWith('http')) return;
  const keys = Object.keys(syncQueue);
  if (keys.length === 0) return;
  const dataToSync = { ...syncQueue };
  // FIX BUG-03: لا تحذف من الطابور إلا بعد تأكيد استلام السيرفر
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToSync)
    });
    if (res.ok) {
      // نجح الإرسال — احذف فقط العناصر التي أُرسلت بالفعل
      for (const k of keys) {
        // لا تحذف لو وُضعت قيمة جديدة في الطابور أثناء الإرسال
        if (syncQueue[k] === dataToSync[k]) delete syncQueue[k];
      }
    } else {
      // السيرفر رفض — أعد البيانات للطابور
      Object.assign(syncQueue, dataToSync);
    }
  } catch (e) {
    // فشل الشبكة — أعد البيانات للطابور لضمان عدم الضياع
    Object.assign(syncQueue, dataToSync);
  }
}

function queueDiskSync(key, val) {
  syncQueue[key] = val;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(pushSyncQueue, 100);
}

// Initial hydration from local server disk
if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
  fetch('/api/sync')
    .then(r => r.ok ? r.json() : null)
    .then(serverState => {
      if (serverState && typeof serverState === 'object') {
        let hydrated = false;
        for (const [k, v] of Object.entries(serverState)) {
          if (v !== undefined && v !== null) {
            try {
              localStorage.setItem(`cafepos_${k}`, JSON.stringify(v));
              hydrated = true;
            } catch (e) {}
          }
        }
        if (hydrated) {
          window.dispatchEvent(new CustomEvent('cafepos:hydrated'));
        }
      }
    })
    .catch(() => {});
}

function getLocal(key, def) {
  try {
    const val = localStorage.getItem(`cafepos_${key}`);
    return val ? JSON.parse(val) : def;
  } catch (e) {
    return def;
  }
}

function setLocal(key, val) {
  try {
    localStorage.setItem(`cafepos_${key}`, JSON.stringify(val));
    queueDiskSync(key, val);
  } catch (e) {}
}

const mockApi = {
  listCategories: async () => getLocal('categories', DEFAULT_CATEGORIES),
  saveCategory: async (cat) => {
    const cats = getLocal('categories', DEFAULT_CATEGORIES);
    if (cat.id) {
      const idx = cats.findIndex((c) => c.id === cat.id);
      if (idx !== -1) cats[idx] = { ...cats[idx], ...cat };
      setLocal('categories', cats);
      return cat;
    } else {
      const newCat = { ...cat, id: Date.now() };
      cats.push(newCat);
      setLocal('categories', cats);
      return newCat;
    }
  },
  deleteCategory: async (id) => {
    const cats = getLocal('categories', DEFAULT_CATEGORIES).filter((c) => c.id !== id);
    setLocal('categories', cats);
    return { success: true };
  },
  reorderCategories: async (orderedIds) => {
    const cats = getLocal('categories', DEFAULT_CATEGORIES);
    orderedIds.forEach((id, idx) => {
      const c = cats.find(x => x.id === id);
      if (c) c.sort_order = idx + 1;
    });
    cats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    setLocal('categories', cats);
    return cats;
  },

  listProducts: async () => {
    const prods = getLocal('products', DEFAULT_PRODUCTS);
    const cats = getLocal('categories', DEFAULT_CATEGORIES);
    return prods.map((p) => {
      const c = cats.find((cat) => cat.id === p.category_id);
      return { ...p, category_name: c?.name || '', category_icon: c?.icon || '☕' };
    });
  },
  saveProduct: async (prod) => {
    const prods = getLocal('products', DEFAULT_PRODUCTS);
    if (prod.id) {
      const idx = prods.findIndex((p) => p.id === prod.id);
      if (idx !== -1) prods[idx] = { ...prods[idx], ...prod };
      setLocal('products', prods);
      return prod;
    } else {
      const newProd = { ...prod, id: Date.now() };
      prods.push(newProd);
      setLocal('products', prods);
      return newProd;
    }
  },
  deleteProduct: async (id) => {
    const prods = getLocal('products', DEFAULT_PRODUCTS).filter((p) => p.id !== id);
    setLocal('products', prods);
    return { success: true };
  },

  listTables: async () => getLocal('tables', DEFAULT_TABLES),
  saveTable: async (tbl) => {
    const tables = getLocal('tables', DEFAULT_TABLES);
    if (tbl.id) {
      const idx = tables.findIndex((t) => t.id === tbl.id);
      if (idx !== -1) tables[idx] = { ...tables[idx], ...tbl };
      setLocal('tables', tables);
      return tbl;
    } else {
      const newTbl = { ...tbl, id: Date.now() };
      tables.push(newTbl);
      setLocal('tables', tables);
      return newTbl;
    }
  },
  deleteTable: async (id) => {
    const tables = getLocal('tables', DEFAULT_TABLES).filter((t) => t.id !== id);
    setLocal('tables', tables);
    return { success: true };
  },
  updateTableStatus: async (id, status, currentOrderId = null) => {
    const tables = getLocal('tables', DEFAULT_TABLES);
    const tbl = tables.find((t) => t.id === id);
    if (tbl) {
      tbl.status = status;
      tbl.current_order_id = currentOrderId;
      setLocal('tables', tables);
    }
    return { success: true };
  },
  toggleTableQr: async (id, enabled) => {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/table/toggle-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), enabled: !!enabled })
      });
      const data = await res.json();
      if (data.success && data.table) return data.table;
    } catch (_) {}

    if (typeof window !== 'undefined' && window.api?.saveTable) {
      try {
        const cur = (await window.api.listTables?.())?.find(t => t.id === Number(id));
        return await window.api.saveTable({ ...(cur || {}), id: Number(id), qr_enabled: enabled ? 1 : 0 });
      } catch (_) {}
    }
    const tables = getLocal('tables', DEFAULT_TABLES);
    const tbl = tables.find((t) => t.id === Number(id));
    if (tbl) {
      tbl.qr_enabled = enabled ? 1 : 0;
      setLocal('tables', tables);
      return tbl;
    }
    return null;
  },
  regenerateTableQrToken: async (id) => {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/table/regenerate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id) })
      });
      const data = await res.json();
      if (data.success && data.table) return data.table;
    } catch (_) {}

    const newToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    if (typeof window !== 'undefined' && window.api?.saveTable) {
      try {
        const cur = (await window.api.listTables?.())?.find(t => t.id === Number(id));
        return await window.api.saveTable({ ...(cur || {}), id: Number(id), qr_token: newToken });
      } catch (_) {}
    }
    const tables = getLocal('tables', DEFAULT_TABLES);
    const tbl = tables.find((t) => t.id === Number(id));
    if (tbl) {
      tbl.qr_token = newToken;
      setLocal('tables', tables);
      return tbl;
    }
    return null;
  },
  resetAllTableQrTokens: async () => {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/table/reset-all-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.tables) return data.tables;
    } catch (_) {}

    if (typeof window !== 'undefined' && window.api?.listTables && window.api?.saveTable) {
      try {
        const tables = (await window.api.listTables()) || [];
        const updated = [];
        for (const t of tables) {
          const newToken = Math.random().toString(36).substring(2, 10).toUpperCase();
          const res = await window.api.saveTable({ ...t, id: t.id, qr_token: newToken });
          updated.push(res);
        }
        return updated;
      } catch (_) {}
    }
    const tables = getLocal('tables', DEFAULT_TABLES);
    tables.forEach(t => {
      t.qr_token = Math.random().toString(36).substring(2, 10).toUpperCase();
    });
    setLocal('tables', tables);
    return tables;
  },
  moveOrderToTable: async ({ fromTableId, toTableId }) => {
    const tables = getLocal('tables', DEFAULT_TABLES);
    const fromTable = tables.find(t => t.id === Number(fromTableId));
    const toTable = tables.find(t => t.id === Number(toTableId));
    if (!fromTable) return { success: false, error: 'الطاولة الأصلية غير موجودة' };
    if (!toTable) return { success: false, error: 'الطاولة المطلوب النقل إليها غير موجودة' };
    return { success: true, fromTable, toTable };
  },
  getTableCarts: async () => {
    // FIX BUG-04: مفتاح واحد موحد — table_carts فقط (= cafepos_table_carts في localStorage)
    const carts = getLocal('table_carts', {});
    return carts || {};
  },
  saveTableCart: async (tableId, cartData) => {
    // FIX BUG-04: استخدام مفتاح واحد فقط بدلاً من الكتابة المزدوجة
    const carts = getLocal('table_carts', {});
    const hasCart = cartData && cartData.cart && cartData.cart.length > 0;
    if (!hasCart) {
      delete carts[tableId];
      delete carts[String(tableId)];
      delete carts[Number(tableId)];
    } else {
      carts[tableId] = cartData;
    }
    setLocal('table_carts', carts);

    const tables = getLocal('tables', DEFAULT_TABLES);
    const tbl = tables.find((t) => t.id === Number(tableId));
    if (tbl) {
      tbl.status = hasCart ? 'occupied' : 'available';
      if (!hasCart) tbl.current_order_id = null;
      setLocal('tables', tables);
    }
    return { success: true, tableId: Number(tableId), updatedAt: new Date().toISOString() };
  },
  saveAllTableCarts: async (cartsMap) => {
    // FIX BUG-04: مفتاح واحد موحد
    setLocal('table_carts', cartsMap || {});
    return { success: true };
  },
  transferTable: async ({ fromTableId, toTableId, targetCartData = null }) => {
    // FIX BUG-04: مفتاح واحد موحد
    const carts = getLocal('table_carts', {});
    const sId = Number(fromTableId);
    const tId = Number(toTableId);
    let finalTargetData = targetCartData || carts[sId] || carts[String(sId)] || null;

    delete carts[sId];
    delete carts[String(sId)];
    if (finalTargetData && finalTargetData.cart && finalTargetData.cart.length > 0) {
      carts[tId] = finalTargetData;
      carts[String(tId)] = finalTargetData;
    }
    setLocal('table_carts', carts);

    const tables = getLocal('tables', DEFAULT_TABLES);
    const fromTbl = tables.find((t) => t.id === sId);
    const toTbl = tables.find((t) => t.id === tId);
    if (fromTbl) {
      fromTbl.status = 'available';
      fromTbl.current_order_id = null;
    }
    if (toTbl) {
      toTbl.status = 'occupied';
    }
    setLocal('tables', tables);
    return { success: true, tableCarts: carts };
  },
  transferTableItem: async ({ fromTableId, toTableId, itemId, qty = 1 }) => {
    // FIX BUG-04: مفتاح واحد موحد
    const carts = getLocal('table_carts', {});
    const sKey = fromTableId;
    const tKey = toTableId;
    const sData = carts[sKey] || { cart: [] };
    const tData = carts[tKey] || { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };

    const itemIdx = (sData.cart || []).findIndex((it) => Number(it.id) === Number(itemId));
    if (itemIdx === -1) return { success: false, error: 'الصنف غير موجود في طاولة المصدر' };

    const item = { ...sData.cart[itemIdx] };
    const actualMoveQty = Math.min(item.qty, Math.max(1, Number(qty) || 1));
    const itemSentQty = Number(item.sent_qty) || 0;
    const transferredSentQty = Math.min(itemSentQty, actualMoveQty);

    item.qty -= actualMoveQty;
    item.sent_qty = Math.max(0, itemSentQty - transferredSentQty);

    if (item.qty <= 0) {
      sData.cart.splice(itemIdx, 1);
    } else {
      sData.cart[itemIdx] = item;
    }

    if (sData.cart.length === 0) {
      delete carts[sKey];
      delete carts[String(sKey)];
    } else {
      carts[sKey] = sData;
    }

    if (!Array.isArray(tData.cart)) tData.cart = [];
    const tItemIdx = tData.cart.findIndex((it) => Number(it.id) === Number(itemId));
    if (tItemIdx >= 0) {
      tData.cart[tItemIdx].qty += actualMoveQty;
      tData.cart[tItemIdx].sent_qty = (Number(tData.cart[tItemIdx].sent_qty) || 0) + transferredSentQty;
    } else {
      tData.cart.push({
        ...item,
        qty: actualMoveQty,
        sent_qty: transferredSentQty
      });
    }
    carts[tKey] = tData;
    setLocal('table_carts', carts);

    const tables = getLocal('tables', DEFAULT_TABLES);
    if (sData.cart.length === 0) {
      const fromTbl = tables.find((t) => t.id === Number(fromTableId));
      if (fromTbl) {
        fromTbl.status = 'available';
        fromTbl.current_order_id = null;
      }
    }
    const toTbl = tables.find((t) => t.id === Number(toTableId));
    if (toTbl) {
      toTbl.status = 'occupied';
    }
    setLocal('tables', tables);

    return {
      success: true,
      sourceCart: sData.cart,
      targetCart: tData.cart,
      tableCarts: carts
    };
  },
  resetTables: async ({ indoorCount = 6, outdoorCount = 6 } = {}) => {
    const newTables = [
      ...Array.from({ length: Number(indoorCount) || 0 }, (_, i) => ({
        id: Date.now() + i + 1,
        number: `A${i + 1}`,
        name: `طاولة ${i + 1}`,
        capacity: i + 1 <= 2 ? 2 : 4,
        status: 'available',
        current_order_id: null,
        hall: 'أرضي'
      })),
      ...Array.from({ length: Number(outdoorCount) || 0 }, (_, i) => ({
        id: Date.now() + 1000 + i + 1,
        number: `U${i + 1}`,
        name: `طاولة ${i + 1}`,
        capacity: i + 1 <= 2 ? 2 : 4,
        status: 'available',
        current_order_id: null,
        hall: 'علوي'
      }))
    ];
    setLocal('tables', newTables);
    return newTables;
  },

  // Sections (Halls)
  listSections: async () => {
    let secs = getLocal('sections', null);
    if (!secs || !secs.length) {
      secs = [
        { id: 1, name: 'أرضي', sort_order: 1, table_count: 8 },
        { id: 2, name: 'علوي', sort_order: 2, table_count: 6 },
        { id: 3, name: 'بارك', sort_order: 3, table_count: 6 },
        { id: 4, name: 'عائلات', sort_order: 4, table_count: 4 },
        { id: 5, name: 'بارك شباب', sort_order: 5, table_count: 6 }
      ];
      setLocal('sections', secs);
    }
    return secs;
  },
  saveSection: async (sec) => {
    let secs = getLocal('sections', []);
    if (sec.id) {
      secs = secs.map(s => s.id === sec.id ? { ...s, name: sec.name, sort_order: sec.sort_order ?? s.sort_order } : s);
    } else {
      const newSec = { id: Date.now(), name: sec.name, sort_order: (secs.length + 1), table_count: 0 };
      secs.push(newSec);
    }
    setLocal('sections', secs);
    return secs;
  },
  deleteSection: async (id) => {
    let secs = getLocal('sections', []);
    secs = secs.filter(s => s.id !== id);
    setLocal('sections', secs);
    return { success: true };
  },
  resetSectionTables: async ({ sectionId, sectionName, tableCount, startNumber = 1, endNumber = null }) => {
    let tables = getLocal('tables', []);
    tables = tables.filter(t => t.hall !== sectionName);
    let start = parseInt(startNumber) || 1;
    let end;
    if (endNumber !== null && endNumber !== undefined && endNumber !== '') {
      end = parseInt(endNumber);
      if (end < start) {
        const tmp = start;
        start = end;
        end = tmp;
      }
    } else {
      const count = Math.max(0, parseInt(tableCount) || 0);
      end = start + count - 1;
    }
    for (let i = start; i <= end; i++) {
      tables.push({
        id: Date.now() + i,
        number: `${i}`,
        name: `طاولة ${i}`,
        capacity: 4,
        status: 'available',
        current_order_id: null,
        hall: sectionName
      });
    }
    setLocal('tables', tables);
    return tables;
  },

  // Comprehensive Reports
  getReportSales: async ({ dateFrom, dateTo, shiftId, userId } = {}) => {
    const orders = getLocal('orders', []).filter(o => o.status !== 'cancelled');
    const fromD = dateFrom ? String(dateFrom).slice(0, 10) : null;
    const toD = dateTo ? String(dateTo).slice(0, 10) : null;
    const shifts = getLocal('shifts', []);
    const filtered = orders.filter(o => {
      const d = o.created_at ? getLocalDateString(o.created_at) : '';
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      if (shiftId && String(o.shift_id) !== String(shiftId)) return false;
      if (userId && String(userId) !== 'all' && String(o.user_id) !== String(userId)) return false;
      return true;
    });
    // FIX BUG-05: احتساب صحيح لطرق الدفع يشمل الدفع المختلط (split)
    const _calcCash = (o) => {
      if (o.payment_method === 'split') return Number(o.cash_amount) || 0;
      if (o.payment_method === 'cash')  return (o.cash_amount != null && Number(o.cash_amount) > 0) ? Number(o.cash_amount) : (Number(o.total) || 0);
      return 0;
    };
    const _calcCard = (o) => {
      if (o.payment_method === 'split') return Number(o.card_amount) || 0;
      if (o.payment_method === 'card')  return Number(o.total) || 0;
      return 0;
    };
    const _calcWallet = (o) => {
      if (o.payment_method === 'split')  return Number(o.wallet_amount) || 0;
      if (o.payment_method === 'wallet') return Number(o.total) || 0;
      return 0;
    };
    const summary = {
      order_count: filtered.length,
      total_sales: filtered.reduce((s, o) => s + (Number(o.total) || 0), 0),
      total_discounts: filtered.reduce((s, o) => s + (Number(o.discount) || 0), 0),
      total_tax: filtered.reduce((s, o) => s + (Number(o.tax) || 0), 0),
      cash_sales:   filtered.reduce((s, o) => s + _calcCash(o),   0),
      card_sales:   filtered.reduce((s, o) => s + _calcCard(o),   0),
      wallet_sales: filtered.reduce((s, o) => s + _calcWallet(o), 0),
      dine_in_sales: filtered.filter(o => o.order_type === 'dine_in').reduce((s, o) => s + (Number(o.total) || 0), 0),
      takeaway_sales: filtered.filter(o => o.order_type === 'takeaway').reduce((s, o) => s + (Number(o.total) || 0), 0)
    };

    // Calculate top products
    const prodMap = {};
    for (const o of filtered) {
      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          const pId = it.product_id || it.id || it.name;
          const pName = it.name || it.product_name || 'صنف';
          if (!prodMap[pId]) prodMap[pId] = { product_id: pId, product_name: pName, total_qty: 0, total_sales: 0 };
          prodMap[pId].total_qty += (Number(it.quantity || it.qty) || 1);
          prodMap[pId].total_sales += (Number(it.total || it.price) || 0);
        }
      }
    }
    const topProducts = Object.values(prodMap).sort((a, b) => b.total_qty - a.total_qty).slice(0, 20);

    // Calculate daily breakdown
    const dayMap = {};
    for (const o of filtered) {
      const day = o.created_at ? getLocalDateString(o.created_at) : '';
      if (!dayMap[day]) dayMap[day] = { day, order_count: 0, total: 0 };
      dayMap[day].order_count += 1;
      dayMap[day].total += (Number(o.total) || 0);
    }
    const dailyBreakdown = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day));

    // Calculate bySection
    const secMap = {};
    for (const o of filtered) {
      if (o.order_type === 'dine_in') {
        const secName = o.section_name || 'صالة';
        const tabName = o.table_name || `طاولة ${o.table_id || ''}`;
        const key = `${secName}_${tabName}`;
        if (!secMap[key]) secMap[key] = { section_name: secName, table_name: tabName, order_count: 0, total: 0 };
        secMap[key].order_count += 1;
        secMap[key].total += (Number(o.total) || 0);
      }
    }
    const bySection = Object.values(secMap).sort((a, b) => b.total - a.total);

    // User breakdown
    const uMap = {};
    for (const o of filtered) {
      const uId = o.user_id || 0;
      const uName = o.cashier_name || 'كاشير';
      if (!uMap[uId]) uMap[uId] = { user_id: uId, user_name: uName, order_count: 0, total_sales: 0, cash_sales: 0, card_sales: 0, wallet_sales: 0 };
      uMap[uId].order_count += 1;
      uMap[uId].total_sales += (Number(o.total) || 0);
      if (o.payment_method === 'cash') uMap[uId].cash_sales += (Number(o.total) || 0);
      else if (o.payment_method === 'card') uMap[uId].card_sales += (Number(o.total) || 0);
      else if (o.payment_method === 'wallet') uMap[uId].wallet_sales += (Number(o.total) || 0);
    }
    const userBreakdown = Object.values(uMap).sort((a, b) => b.total_sales - a.total_sales);

    const ordersList = filtered.slice(0, 200).map(o => ({
      id: o.id,
      invoice_no: o.invoice_no || String(o.id),
      created_at: o.created_at,
      order_type: o.order_type,
      customer_name: o.customer_name,
      total: o.total,
      payment_method: o.payment_method,
      status: o.status,
      cashier_name: o.cashier_name || 'كاشير',
      table_name: o.table_name || (o.order_type === 'dine_in' ? `طاولة ${o.table_id}` : 'تيك أواي')
    }));

    return { summary, topProducts, dailyBreakdown, bySection, userBreakdown, ordersList };
  },
  getReportInventory: async () => {
    const products = getLocal('products', []);
    return { allProducts: products, movements: [], movementSummary: [], lowStock: products.filter(p => Number(p.stock_qty) <= Number(p.low_stock_threshold || 5)) };
  },
  getReportShift: async ({ shiftId } = {}) => {
    const shifts = getLocal('shifts', []);
    const shift = shifts.find(s => Number(s.id) === Number(shiftId));
    const orders = getLocal('orders', []).filter(o => Number(o.shift_id) === Number(shiftId) && o.status !== 'cancelled');
    const expenses = getLocal('expenses', []).filter(e => Number(e.shift_id) === Number(shiftId));

    const itemMap = {};
    for (const o of orders) {
      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          const pName = it.name || it.product_name || 'صنف';
          if (!itemMap[pName]) itemMap[pName] = { product_name: pName, total_qty: 0, total_sales: 0 };
          itemMap[pName].total_qty += (Number(it.quantity || it.qty) || 1);
          itemMap[pName].total_sales += (Number(it.total || it.price) || 0);
        }
      }
    }
    const itemsSummary = Object.values(itemMap).sort((a, b) => b.total_qty - a.total_qty);

    return { shift, orders, itemsSummary, expenses, stockConsumed: [] };
  },

  currentShift: async () => {
    const shifts = getLocal('shifts', []);
    const cur = shifts.find((s) => !s.closed_at);
    if (!cur) return null;
    const orders = getLocal('orders', []).filter((o) => Number(o.shift_id) === Number(cur.id) && o.status !== 'cancelled');
    const expenses = getLocal('expenses', []).filter((e) => Number(e.shift_id) === Number(cur.id));
    let cashSales = 0;
    let cardSales = 0;
    let walletSales = 0;
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const t = Number(o.total) || 0;
      const isNotebookOrder = (o.order_type === 'notebook' || o.payment_method === 'notebook');

      if (o.payment_method === 'split') {
        cashSales += (Number(o.cash_amount) || 0);
        cardSales += (Number(o.card_amount) || 0);
        walletSales += (Number(o.wallet_amount) || 0);
      } else if (isNotebookOrder) {
        cashSales += (Number(o.cash_amount) || 0);
      } else if (o.payment_method === 'cash') {
        cashSales += (o.cash_amount !== null && o.cash_amount !== undefined && Number(o.cash_amount) > 0) ? Number(o.cash_amount) : t;
      } else if (o.payment_method === 'card') {
        cardSales += t;
      } else if (o.payment_method === 'wallet') {
        walletSales += t;
      }
    }
    const totalSales = orders.reduce((s, o) => s + (o.status === 'cancelled' ? 0 : (Number(o.total) || 0)), 0);
    const totalExp = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const expectedCash = (cur.opening_cash || 0) + cashSales - totalExp;

    return {
      ...cur,
      cash_sales: cashSales,
      card_sales: cardSales,
      wallet_sales: walletSales,
      total_sales: totalSales,
      total_orders: orders.filter((o) => o.status !== 'cancelled').length,
      expenses_total: totalExp,
      expected_cash: expectedCash
    };
  },
  openShift: async (openingCash, notes = '', user = null, shiftType = 'الشيفت الصباحي (الأول)') => {
    const shifts = getLocal('shifts', []);
    const newShift = {
      id: Date.now(),
      opened_at: new Date().toISOString(),
      closed_at: null,
      opening_cash: Number(openingCash) || 0,
      notes,
      user_id: user?.id || null,
      user_name: user?.name || (user?.username || 'كاشير'),
      shift_type: shiftType
    };
    shifts.push(newShift);
    setLocal('shifts', shifts);
    return mockApi.currentShift();
  },
  closeShift: async (shiftId, actualCash = null, notes = '') => {
    const shifts = getLocal('shifts', []);
    const cur = shifts.find((s) => s.id === shiftId);
    if (cur) {
      const stats = await mockApi.currentShift();
      const expected = stats?.expected_cash || 0;
      let effActual = expected;
      if (actualCash !== null && actualCash !== undefined && actualCash !== '') {
        const parsed = Number(actualCash);
        if (parsed < 0) {
          effActual = expected + parsed; // negative entered as deficit
        } else {
          effActual = parsed;
        }
      }
      cur.closed_at = new Date().toISOString();
      cur.closing_cash = expected;
      cur.actual_cash = effActual;
      cur.notes = notes;
      setLocal('shifts', shifts);
      return {
        closingCash: expected,
        actualCash: effActual,
        cashDifference: effActual - expected,
        totalSales: stats?.total_sales || 0,
        totalOrders: stats?.total_orders || 0
      };
    }
    return null;
  },
  listShifts: async (limit = 50, userId = null) => {
    const shifts = getLocal('shifts', []);
    if (userId) return shifts.filter((s) => s.user_id === userId).slice(0, limit);
    return shifts.slice(0, limit);
  },
  addShiftAdjustment: async ({ shiftId, type, amount, reason = '', actor = null } = {}) => {
    const adjustments = getLocal('shift_adjustments', []);
    const newAdj = {
      id: Date.now(),
      shift_id: Number(shiftId),
      type,
      amount: Number(amount) || 0,
      reason: reason || '',
      created_by: actor?.name || 'المدير',
      created_at: new Date().toISOString()
    };
    adjustments.unshift(newAdj);
    setLocal('shift_adjustments', adjustments);
    return { success: true, id: newAdj.id, adjustment: newAdj };
  },
  listShiftAdjustments: async (shiftId) => {
    const adjustments = getLocal('shift_adjustments', []);
    return adjustments.filter(a => Number(a.shift_id) === Number(shiftId));
  },

  hasAdminUser: async () => {
    const users = await mockApi.listUsers();
    return users.some((u) => u.role === 'admin' && !u.password?.includes('DISABLED'));
  },
  setupInitialAdmin: async (adminPassword, adminName = 'مدير النظام') => {
    if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.trim().length < 6) {
      return { success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    }
    const cleanPass = adminPassword.trim();
    const hashed = hashPassword(cleanPass);
    let users = getLocal('users', DEFAULT_USERS);
    let admin = users.find((u) => u.role === 'admin');
    if (admin) {
      admin.name = adminName;
      admin.password = hashed;
      admin.must_change_password = 0;
    } else {
      admin = {
        id: 1,
        username: 'admin',
        name: adminName,
        password: hashed,
        role: 'admin',
        phone: '01000000000',
        salary: 6000,
        shift_name: 'جميع الأوقات',
        shift_start: '00:00',
        shift_end: '23:59',
        created_at: new Date().toISOString(),
        must_change_password: 0
      };
      users.unshift(admin);
    }
    setLocal('users', users);
    return { success: true };
  },
  listUsers: async () => {
    let users = getLocal('users', null);
    let modified = false;
    if (!users) {
      users = DEFAULT_USERS;
      modified = true;
    }
    users = users.map((u) => {
      // Invalidate any legacy plaintext passwords
      if (!u.password || (!u.password.startsWith('$2a$') && !u.password.startsWith('$2b$'))) {
        modified = true;
        return {
          ...u,
          password: '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_000',
          must_change_password: 1
        };
      }
      return u;
    });
    if (modified) {
      setLocal('users', users);
    }
    return users;
  },
  getUser: async (id) => {
    const users = await mockApi.listUsers();
    return users.find((u) => u.id === id) || null;
  },
  saveUser: async (user) => {
    const users = await mockApi.listUsers();
    if (user.id) {
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx !== -1) {
        let updatedPass = users[idx].password;
        let mustChange = user.must_change_password !== undefined ? user.must_change_password : users[idx].must_change_password;
        if (user.password && user.password.trim()) {
          updatedPass = (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))
            ? user.password
            : hashPassword(user.password);
          mustChange = 0;
        }
        users[idx] = {
          ...users[idx],
          ...user,
          password: updatedPass,
          must_change_password: mustChange
        };
      }
      setLocal('users', users);
      return user;
    } else {
      const newUser = {
        ...user,
        id: Date.now(),
        password: user.password && user.password.trim()
          ? hashPassword(user.password)
          : '$2a$10$DISABLED_NON_FUNCTIONAL_HASH_FOR_SECURITY_MUST_SETUP_NEW',
        created_at: new Date().toISOString(),
        must_change_password: 1
      };
      users.push(newUser);
      setLocal('users', users);
      return newUser;
    }
  },
  deleteUser: async (id) => {
    const users = await mockApi.listUsers();
    const user = users.find((u) => u.id === id);
    if (user && user.role === 'admin') {
      const admins = users.filter((u) => u.role === 'admin');
      if (admins.length <= 1) {
        return { success: false, error: 'لا يمكن حذف المدير الرئيسي الوحيد في النظام' };
      }
    }
    const filtered = users.filter((u) => u.id !== id);
    setLocal('users', filtered);
    return { success: true };
  },
  loginUser: async (username, password) => {
    const users = await mockApi.listUsers();
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    const u = users.find((x) => {
      const matchUser = (x.username || '').toLowerCase() === cleanUser;
      const matchPass = verifyPassword(cleanPass, x.password);
      return matchUser && matchPass;
    });

    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      phone: u.phone,
      salary: Number(u.salary) || 3500,
      shift_name: u.shift_name,
      shift_start: u.shift_start,
      shift_end: u.shift_end,
      must_change_password: u.must_change_password || 0
    };
  },
  verifyAdminPassword: async (adminPassword) => {
    if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
      return { success: false, error: 'يرجى إدخال كلمة مرور الأدمن' };
    }
    const cleanPass = String(adminPassword).trim();
    const users = await mockApi.listUsers();
    const admin = users.find((u) => u.role === 'admin' && verifyPassword(cleanPass, u.password));
    if (!admin) {
      return { success: false, error: 'كلمة مرور الأدمن غير صحيحة!' };
    }
    return { success: true };
  },
  adminOverlayLogin: async (adminPassword) => {
    const check = await mockApi.verifyAdminPassword(adminPassword);
    if (!check || !check.success) return check;
    const users = await mockApi.listUsers();
    const admin = users.find((u) => u.role === 'admin') || {
      id: 1,
      username: 'admin',
      name: 'المدير العام',
      role: 'admin'
    };
    return { success: true, user: admin };
  },
  adminOverlayReturn: async () => {
    return { success: true };
  },
  logoutUser: async () => {
    return { success: true };
  },
  changePassword: async ({ userId, currentPassword, newPassword }) => {
    if (!newPassword || String(newPassword).trim().length < 6) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' };
    }
    const users = await mockApi.listUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) {
      return { success: false, error: 'المستخدم غير موجود' };
    }
    if (currentPassword !== undefined && currentPassword !== null) {
      if (!verifyPassword(currentPassword, u.password)) {
        return { success: false, error: 'كلمة المرور الحالية غير صحيحة' };
      }
    }
    u.password = hashPassword(newPassword);
    u.must_change_password = 0;
    setLocal('users', users);
    return { success: true };
  },
  getUserAttendanceReports: async (dateFilter = null) => {
    const users = getLocal('users', DEFAULT_USERS);
    let shifts = getLocal('shifts', []);
    const orders = getLocal('orders', []);
    const expenses = getLocal('expenses', []);

    if (dateFilter) {
      shifts = shifts.filter((s) => (s.opened_at || '').startsWith(dateFilter));
    }

    const enrichedShifts = shifts.map((s) => {
      const ords = orders.filter((o) => o.shift_id === s.id && o.status !== 'cancelled');
      const exps = expenses.filter((e) => e.shift_id === s.id);
      const totalSales = ords.reduce((sum, o) => sum + (o.total || 0), 0);
      const cashSales = ords.filter((o) => o.payment_method === 'cash').reduce((sum, o) => sum + (o.total || 0), 0);
      const cardSales = ords.filter((o) => o.payment_method === 'card').reduce((sum, o) => sum + (o.total || 0), 0);
      const walletSales = ords.filter((o) => o.payment_method === 'wallet').reduce((sum, o) => sum + (o.total || 0), 0);
      const expensesTotal = exps.reduce((sum, e) => sum + (e.amount || 0), 0);

      return {
        ...s,
        orders_count: ords.length,
        total_sales: totalSales,
        cash_sales_total: cashSales,
        card_sales_total: cardSales,
        wallet_sales_total: walletSales,
        expenses_amount: expensesTotal
      };
    });

    const userSummaries = users.map((u) => {
      const uShifts = enrichedShifts.filter((s) => s.user_id === u.id);
      const totalSales = uShifts.reduce((sum, s) => sum + (s.total_sales || 0), 0);
      const totalOrders = uShifts.reduce((sum, s) => sum + (s.orders_count || 0), 0);
      return {
        userId: u.id,
        userName: u.name,
        totalSales,
        totalOrders,
        totalShifts: uShifts.length
      };
    });

    return { users, shifts: enrichedShifts, userSummaries };
  },
  listEmployeeAdjustments: async (userId = null) => {
    const adj = getLocal('employee_adjustments', []);
    const users = getLocal('users', DEFAULT_USERS);
    const enriched = adj.map((a) => {
      const u = users.find((x) => x.id === a.user_id);
      return { ...a, user_name: u?.name || 'موظف', user_role: u?.role || 'cashier' };
    });
    if (userId) return enriched.filter((a) => a.user_id === Number(userId));
    return enriched;
  },
  addEmployeeAdjustment: async (payload) => {
    const adj = getLocal('employee_adjustments', []);
    const newAdj = {
      id: Date.now(),
      user_id: Number(payload.userId),
      type: payload.type,
      amount: Number(payload.amount) || 0,
      days_count: Number(payload.daysCount) || 0,
      date: payload.date || new Date().toISOString().slice(0, 10),
      reason: payload.reason || '',
      created_at: new Date().toISOString(),
      created_by: payload.createdBy || 'المدير'
    };
    adj.unshift(newAdj);
    setLocal('employee_adjustments', adj);
    return newAdj;
  },
  deleteEmployeeAdjustment: async (id) => {
    const adj = getLocal('employee_adjustments', []);
    setLocal('employee_adjustments', adj.filter((x) => x.id !== Number(id)));
    return { success: true };
  },

  getMonthlyPayroll: async (monthStr = null) => {
    const targetMonth = monthStr || new Date().toISOString().slice(0, 7);
    const users = getLocal('users', DEFAULT_USERS);
    const adjustments = getLocal('employee_adjustments', []);
    const shifts = getLocal('shifts', []);

    const records = users.map((u) => {
      const baseSalary = Number(u.salary) || 3500;
      const dailyRate = Math.round((baseSalary / 30) * 100) / 100;

      const monthShifts = shifts.filter(
        (s) => s.user_id === u.id && s.opened_at?.startsWith(targetMonth) && s.closed_at
      );

      const monthAdj = adjustments.filter(
        (a) => a.user_id === u.id && (a.date || '').startsWith(targetMonth)
      );

      const absenceDays = monthAdj
        .filter((a) => a.type === 'absence')
        .reduce((sum, a) => sum + (Number(a.days_count) || 1), 0);

      const absenceDeduction = Math.round(absenceDays * dailyRate * 100) / 100;

      const penaltiesTotal = monthAdj
        .filter((a) => a.type === 'penalty')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const bonusesTotal = monthAdj
        .filter((a) => a.type === 'bonus')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const totalDeductions = absenceDeduction + penaltiesTotal;
      const netSalary = Math.max(0, Math.round((baseSalary - totalDeductions + bonusesTotal) * 100) / 100);

      return {
        userId: u.id,
        userName: u.name,
        userRole: u.role,
        phone: u.phone,
        shiftName: u.shift_name,
        baseSalary,
        dailyRate,
        shiftsAttended: monthShifts.length,
        absenceDays,
        absenceDeduction,
        penaltiesTotal,
        bonusesTotal,
        totalDeductions,
        netSalary,
        month: targetMonth,
        adjustments: monthAdj
      };
    });

    return {
      month: targetMonth,
      records,
      totals: {
        totalBaseSalaries: records.reduce((s, p) => s + p.baseSalary, 0),
        totalAbsenceDeductions: records.reduce((s, p) => s + p.absenceDeduction, 0),
        totalPenalties: records.reduce((s, p) => s + p.penaltiesTotal, 0),
        totalBonuses: records.reduce((s, p) => s + p.bonusesTotal, 0),
        totalNetSalaries: records.reduce((s, p) => s + p.netSalary, 0)
      }
    };
  },

  addExpense: async (exp) => {
    const expenses = getLocal('expenses', []);
    const cur = await mockApi.currentShift();
    const newExp = {
      id: Date.now(),
      shift_id: cur ? cur.id : null,
      created_at: new Date().toISOString(),
      amount: Number(exp.amount),
      category: exp.category || 'مصروفات عامة',
      notes: exp.notes || ''
    };
    expenses.unshift(newExp);
    setLocal('expenses', expenses);
    return newExp;
  },
  listExpenses: async () => getLocal('expenses', []),
  updateExpense: async (exp) => {
    const expenses = getLocal('expenses', []);
    const idx = expenses.findIndex(e => Number(e.id) === Number(exp.id));
    if (idx !== -1) {
      expenses[idx] = {
        ...expenses[idx],
        amount: exp.amount !== undefined ? Number(exp.amount) : expenses[idx].amount,
        category: exp.category !== undefined ? exp.category : expenses[idx].category,
        notes: exp.notes !== undefined ? exp.notes : expenses[idx].notes
      };
      setLocal('expenses', expenses);
      return { success: true, ...expenses[idx] };
    }
    return { success: false, error: 'المصروف غير موجود' };
  },
  deleteExpense: async (id) => {
    let expenses = getLocal('expenses', []);
    expenses = expenses.filter(e => Number(e.id) !== Number(id));
    setLocal('expenses', expenses);
    return { success: true };
  },

  createOrder: async (payload) => {
    const cur = await mockApi.currentShift();
    if (!cur) {
      throw new Error('لا يوجد شيفت مفتوح حالياً. يجب فتح شيفت قبل إتمام أي عملية بيع');
    }
    const orders = getLocal('orders', []);
    const subtotal = payload.items.reduce((s, it) => s + it.price * it.qty, 0);
    const total = Math.max(0, subtotal - (payload.discount || 0) + (payload.tax || 0));
    const isNotebook = payload.orderType === 'notebook' || payload.paymentMethod === 'notebook';
    const effectivePaid = isNotebook ? (Number(payload.amountPaid) || 0) : (payload.amountPaid !== '' && payload.amountPaid !== undefined ? Number(payload.amountPaid) : total);
    const tables = getLocal('tables', DEFAULT_TABLES);
    const tbl = payload.tableId ? tables.find((t) => t.id === payload.tableId) : null;
    const invoiceNo = `${orders.length + 1}`;
    const newOrder = {
      id: Date.now(),
      invoice_no: invoiceNo,
      shift_id: payload.shiftId || (cur ? cur.id : null),
      table_id: payload.tableId || null,
      table_name: payload.tableName || (tbl ? tbl.name : ''),
      table_number: payload.tableNumber || (tbl ? tbl.number : ''),
      hall: payload.hall || (tbl ? tbl.hall : ''),
      table_hall: payload.hall || (tbl ? tbl.hall : ''),
      order_type: payload.orderType || 'takeaway',
      customer_name: payload.customerName || '',
      customer_phone: payload.customerPhone || '',
      customer_address: payload.customerAddress || '',
      customerName: payload.customerName || '',
      customerPhone: payload.customerPhone || '',
      customerAddress: payload.customerAddress || '',
      created_at: new Date().toISOString(),
      subtotal,
      discount: payload.discount || 0,
      tax: payload.tax || 0,
      total,
      payment_method: payload.paymentMethod || 'cash',
      cash_amount: payload.paymentMethod === 'split' ? (Number(payload.cashAmount) || 0) : (payload.paymentMethod === 'cash' ? total : 0),
      card_amount: payload.paymentMethod === 'split' ? (Number(payload.cardAmount) || 0) : (payload.paymentMethod === 'card' ? total : 0),
      wallet_amount: payload.paymentMethod === 'split' ? (Number(payload.walletAmount) || 0) : (payload.paymentMethod === 'wallet' ? total : 0),
      amount_paid: effectivePaid,
      change_due: isNotebook ? 0 : Math.max(0, effectivePaid - total),
      status: 'completed',
      notes: payload.notes || '',
      items: payload.items,
      user_id: payload.user?.id || (cur ? cur.user_id : null),
      cashier_name: payload.user?.name || (cur ? cur.user_name : 'كاشير'),
      shift_name: cur?.shift_type || payload.user?.shift_name || 'الشيفت الصباحي'
    };
    orders.unshift(newOrder);
    setLocal('orders', orders);

    if (payload.customerPhone && String(payload.customerPhone).trim().length >= 3) {
      const custs = getLocal('customers', []);
      const pClean = String(payload.customerPhone).trim();
      const existing = custs.find((c) => c.phone === pClean);
      if (existing) {
        if (payload.customerName) existing.name = payload.customerName;
        if (payload.customerAddress) existing.address = payload.customerAddress;
      } else {
        custs.unshift({
          id: Date.now(),
          name: payload.customerName || 'عميل تيك أواي',
          phone: pClean,
          address: payload.customerAddress || '',
          created_at: new Date().toISOString()
        });
      }
      setLocal('customers', custs);
    }

    if (isNotebook) {
      const debts = getLocal('debts', []);
      const remaining = Math.max(0, total - effectivePaid);
      const newDebt = {
        id: Date.now(),
        order_id: newOrder.id,
        customer_name: payload.customerName || 'عميل نوتة',
        customer_phone: payload.customerPhone || '',
        table_name: tbl?.name || '',
        total_amount: total,
        paid_amount: effectivePaid,
        remaining_amount: remaining,
        status: remaining <= 0 ? 'paid' : (effectivePaid > 0 ? 'partial' : 'unpaid'),
        created_at: new Date().toISOString(),
        notes: payload.notes || '',
        items: payload.items,
        payments: []
      };
      debts.unshift(newDebt);
      setLocal('debts', debts);
    }

    const prods = getLocal('products', DEFAULT_PRODUCTS);
    const settings = getLocal('settings', DEFAULT_SETTINGS);
    const allowNegative = settings.allow_negative_stock === '1';

    for (const it of payload.items) {
      const p = prods.find((x) => x.id === it.id);
      if (p && p.stock_qty < it.qty && !allowNegative) {
        throw new Error(`المخزون غير كاف للصنف: ${p.name} (المتاح: ${p.stock_qty}, المطلوب: ${it.qty})`);
      }
    }

    for (const it of payload.items) {
      const p = prods.find((x) => x.id === it.id);
      if (p) p.stock_qty = Math.max(0, (p.stock_qty || 0) - it.qty);
    }
    setLocal('products', prods);

    return newOrder;
  },
  listDebts: async () => {
    const debts = getLocal('debts', []);
    const orders = getLocal('orders', []);
    return debts.map((d) => {
      const o = orders.find((ord) => ord.id === d.order_id);
      return {
        ...d,
        invoice_no: o?.invoice_no || d.invoice_no || '',
        order_date: o?.created_at || d.created_at,
        order_shift_id: o?.shift_id || null,
        last_payment_at: d.payments && d.payments.length > 0 ? d.payments[0].created_at : null,
        last_payment_amount: d.payments && d.payments.length > 0 ? d.payments[0].amount : null
      };
    });
  },
  payDebt: async ({ debtId, amount, notes = '', cashierName = '' }) => {
    const debts = getLocal('debts', []);
    const d = debts.find((x) => x.id === debtId);
    if (!d) return { success: false, error: 'النوتة غير موجودة' };
    const payAmt = Number(amount) || 0;
    d.paid_amount = (d.paid_amount || 0) + payAmt;
    d.remaining_amount = Math.max(0, d.total_amount - d.paid_amount);
    d.status = d.remaining_amount <= 0 ? 'paid' : 'partial';
    d.payments = d.payments || [];
    d.payments.unshift({
      id: Date.now(),
      debt_id: debtId,
      amount: payAmt,
      cashier_name: cashierName || 'كاشير',
      created_at: new Date().toISOString(),
      notes: `سداد من النوتة - العميل ${d.customer_name}${notes ? ` (${notes})` : ''}`
    });
    setLocal('debts', debts);
    return { success: true, newPaid: d.paid_amount, newRemaining: d.remaining_amount, newStatus: d.status };
  },
  payCustomerDebtsFIFO: async ({ customerId = null, customerName, customerPhone = '', amount, notes = '', cashierName = '' }) => {
    const debts = getLocal('debts', []);
    const cleanName = String(customerName || '').trim();
    let payAmt = Number(amount) || 0;
    if (payAmt <= 0) return { success: false, error: 'مبلغ السداد يجب أن يكون أكبر من الصفر' };
    const matching = debts.filter(d => {
      if (d.status === 'paid' || d.status === 'cancelled') return false;
      if (customerId && d.customer_id === customerId) return true;
      if (cleanName && d.customer_name === cleanName) return true;
      return false;
    });
    for (const d of matching) {
      if (payAmt <= 0) break;
      const rem = d.remaining_amount || (d.total_amount - (d.paid_amount || 0));
      const apply = Math.min(payAmt, rem);
      d.paid_amount = (d.paid_amount || 0) + apply;
      d.remaining_amount = Math.max(0, d.total_amount - d.paid_amount);
      d.status = d.remaining_amount <= 0 ? 'paid' : 'partial';
      d.payments = d.payments || [];
      d.payments.unshift({
        id: Date.now() + Math.random(),
        debt_id: d.id,
        amount: apply,
        cashier_name: cashierName || 'كاشير',
        created_at: new Date().toISOString(),
        notes: `سداد من حساب العميل ${cleanName}${notes ? ` (${notes})` : ''}`
      });
      payAmt -= apply;
    }
    setLocal('debts', debts);
    return { success: true };
  },
  deleteDebt: async ({ debtId, adminPassword }) => {
    const users = await mockApi.listUsers();
    const admin = users.find((u) => u.role === 'admin' && verifyPassword(adminPassword, u.password));
    if (!admin) {
      return { success: false, error: 'كلمة مرور الأدمن غير صحيحة! لا يمكن مسح النوتة بدون إذن الأدمن.' };
    }
    const debts = getLocal('debts', []).filter((x) => x.id !== debtId);
    setLocal('debts', debts);
    return { success: true };
  },
  getOrder: async (id) => {
    const orders = getLocal('orders', []);
    return orders.find((o) => o.id === id) || null;
  },
  listOrders: async (filters = {}) => {
    let orders = getLocal('orders', []);
    const shifts = getLocal('shifts', []);
    const users = getLocal('users', DEFAULT_USERS);
    const tables = getLocal('tables', DEFAULT_TABLES);
    const debts = getLocal('debts', []);

    if (filters && filters.shiftId) {
      orders = orders.filter((o) => o.shift_id === filters.shiftId);
    } else if (filters && filters.userId) {
      const userShiftIds = shifts.filter((s) => s.user_id === filters.userId).map((s) => s.id);
      orders = orders.filter((o) => userShiftIds.includes(o.shift_id));
    }

    return orders.map((o) => {
      const s = shifts.find((x) => x.id === o.shift_id);
      const u = s ? users.find((x) => x.id === s.user_id) : null;
      const t = tables.find((x) => x.id === o.table_id);
      const d = debts.find((deb) => deb.order_id === o.id);
      return {
        ...o,
        table_name: t?.name || o.table_name || '',
        cashier_name: u?.name || 'كاشير',
        shift_name: s?.shift_type || 'الشيفت الصباحي',
        shift_opened_at: s?.opened_at || null,
        debt_status: d?.status || null,
        debt_paid_amount: d?.paid_amount || null,
        debt_remaining_amount: d?.remaining_amount || null,
        debt_id: d?.id || null,
        debt_payments: d?.payments || []
      };
    });
  },
  updateOrder: async (id, payload) => {
    const orders = getLocal('orders', []);
    const o = orders.find((x) => x.id === id);
    if (!o) return { success: false, error: 'الفاتورة غير موجودة' };
    if (payload.customerName !== undefined) o.customer_name = payload.customerName;
    if (payload.orderType) o.order_type = payload.orderType;
    if (payload.paymentMethod) o.payment_method = payload.paymentMethod;
    if (payload.discount !== undefined) {
      o.discount = Number(payload.discount) || 0;
      o.total = Math.max(0, (o.subtotal || 0) - o.discount + (o.tax || 0));
    }
    if (payload.notes !== undefined) o.notes = payload.notes;
    setLocal('orders', orders);
    return { success: true, order: o };
  },
  cancelOrder: async (id, reason = '') => {
    const orders = getLocal('orders', []);
    const o = orders.find((x) => x.id === id);
    if (o) {
      if (o.status === 'cancelled') return { success: false, error: 'الطلب ملغي بالفعل' };
      o.status = 'cancelled';
      o.notes = `${o.notes || ''} [ملغي: ${reason}]`;
      setLocal('orders', orders);

      // Restore product quantities in stock
      const prods = getLocal('products', DEFAULT_PRODUCTS);
      for (const it of o.items || []) {
        const p = prods.find((x) => x.id === (it.product_id || it.id));
        if (p) {
          p.stock_qty = (p.stock_qty || 0) + (it.qty || 0);
        }
      }
      setLocal('products', prods);

      // Restore table status if dine_in
      if (o.table_id) {
        const tables = getLocal('tables', DEFAULT_TABLES);
        const tbl = tables.find((t) => t.id === o.table_id);
        if (tbl) {
          tbl.status = 'available';
          tbl.current_order_id = null;
          setLocal('tables', tables);
        }
      }

      // Cancel associated customer debt if notebook
      const debts = getLocal('debts', []);
      const d = debts.find((deb) => deb.order_id === id);
      if (d) {
        d.status = 'cancelled';
        setLocal('debts', debts);
      }
    }
    return { success: true };
  },
    restoreOrder: async (id, adminPassword) => {
    const orders = getLocal('orders', []);
    const o = orders.find((x) => x.id === id);
    if (!o) return { success: false, error: 'الطلب غير موجود' };
    if (o.status !== 'cancelled') return { success: false, error: 'الطلب غير ملغي' };
    o.status = 'completed';
    o.notes = (o.notes || '').replace(/\s*\[إلغاء:[^\]]*\]/g, '').trim();
    setLocal('orders', orders);

    // Re-deduct product quantities from stock
    const prods = getLocal('products', DEFAULT_PRODUCTS);
    for (const it of o.items || []) {
      const p = prods.find((x) => x.id === (it.product_id || it.id));
      if (p) {
        p.stock_qty = Math.max(0, (p.stock_qty || 0) - (it.qty || 0));
      }
    }
    setLocal('products', prods);

    // Restore associated customer debt if notebook
    const debts = getLocal('debts', []);
    const d = debts.find((deb) => deb.order_id === id);
    if (d) {
      d.status = 'unpaid';
      setLocal('debts', debts);
    }
    return { success: true };
  },

  clearAllOrders: async () => {
    setLocal('orders', []);
    return { success: true };
  },

  todaySales: async () => {
    const orders = getLocal('orders', []).filter((o) => o.status !== 'cancelled');
    const total = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const cashTotal = orders.reduce((s, o) => {
      if (o.payment_method === 'cash') return s + (Number(o.total) || 0);
      if (o.payment_method === 'split') return s + (Number(o.cash_amount) || 0);
      return s;
    }, 0);
    const cardTotal = orders.reduce((s, o) => {
      if (o.payment_method === 'card') return s + (Number(o.total) || 0);
      if (o.payment_method === 'split') return s + (Number(o.card_amount) || 0);
      return s;
    }, 0);
    const walletTotal = orders.reduce((s, o) => {
      if (o.payment_method === 'wallet') return s + (Number(o.total) || 0);
      if (o.payment_method === 'split') return s + (Number(o.wallet_amount) || 0);
      return s;
    }, 0);
    return { total, count: orders.length, cash_total: cashTotal, card_total: cardTotal, wallet_total: walletTotal };
  },

  dashboardStats: async () => {
    const today = await mockApi.todaySales();
    const shift = await mockApi.currentShift();
    const prods = getLocal('products', DEFAULT_PRODUCTS);
    const lowStock = prods.filter((p) => (p.stock_qty || 0) <= (p.low_stock_threshold || 10));
    return {
      today,
      shift,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock,
      topProducts: prods.slice(0, 6).map((p) => ({ product_name: p.name, total_qty: 25, total_sales: p.price * 25 }))
    };
  },

  getSettings: async () => {
    const stored = getLocal('settings', {});
    // Merge with defaults so vendor feature keys always exist
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    // Normalize any legacy boolean values to strings to ensure === 'true' checks work correctly
    const VENDOR_BOOL_KEYS = [
      'show_notebook_to_cashier',
      'require_password_transfer_tables',
      'allow_cashier_cancel_orders',
      'show_stock_alert_on_order',
      'enable_bar_order',
      'enable_guest_check'
    ];
    VENDOR_BOOL_KEYS.forEach((k) => {
      if (merged[k] === true || merged[k] === '1') merged[k] = 'true';
      else if (merged[k] === false || merged[k] === '0') merged[k] = 'false';
      else if (merged[k] === undefined || merged[k] === null) {
        merged[k] = (k === 'enable_bar_order' || k === 'enable_guest_check') ? 'true' : 'false';
      }
    });
    return merged;
  },
  saveSettings: async (s) => {
    const current = getLocal('settings', {});
    const filtered = { ...s };
    const VENDOR_BOOL_KEYS = [
      'show_notebook_to_cashier',
      'require_password_transfer_tables',
      'allow_cashier_cancel_orders',
      'show_stock_alert_on_order',
      'enable_bar_order',
      'enable_guest_check',
      'show_shift_status_bar',
      'show_bar_ticket_in_receipt'
    ];
    VENDOR_BOOL_KEYS.forEach((k) => {
      if (current[k] !== undefined) {
        filtered[k] = current[k];
      }
    });
    const merged = { ...DEFAULT_SETTINGS, ...current, ...filtered };
    setLocal('settings', merged);
    return merged;
  },

  verifyVendorPassword: async (password) => {
    // Mock mode in dev browser: only accept Ed25519-like dev key or disallow
    return { success: false, error: 'تفعيل المطور متاح فقط من خلال النظام المشفر' };
  },

  saveVendorFeatures: async ({ vendorPassword, features }) => {
    const s = getLocal('settings', DEFAULT_SETTINGS);
    // Convert all feature values to strings to match === 'true' checks in App.jsx
    const stringifiedFeatures = {};
    Object.keys(features || {}).forEach((key) => {
      stringifiedFeatures[key] = String(features[key]);
    });
    const updated = { ...s, ...stringifiedFeatures };
    setLocal('settings', updated);
    return { success: true, settings: updated };
  },

  createBackup: async () => {
    try {
      const backupData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cafepos_')) {
          backupData[key.replace('cafepos_', '')] = JSON.parse(localStorage.getItem(key));
        }
      }
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `نسخة_احتياطية_تقفيلة_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also tell server to save a backup on disk
      if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonStr
        }).catch(() => {});
      }

      return { success: true, message: 'تم حفظ وتنزيل النسخة الاحتياطية بنجاح' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  restoreBackup: async (fileContentOrObj) => {
    try {
      let data = fileContentOrObj;
      if (typeof data === 'string') data = JSON.parse(data);
      if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          setLocal(k, v);
        }
        return { success: true, message: 'تم استرجاع البيانات بنجاح' };
      }
      return { success: false, error: 'صيغة الملف غير صالحة' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  dialogSaveBackup: async () => mockApi.createBackup(),
  dialogRestoreBackup: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return resolve({ success: false });
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const res = await mockApi.restoreBackup(evt.target.result);
            resolve(res);
            window.location.reload();
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  },

  exportOrdersCsv: async (filters = {}) => {
    try {
      const orders = getLocal('orders', []);
      let filtered = orders;
      if (filters.date) filtered = filtered.filter(o => (o.created_at || '').startsWith(filters.date));
      if (filters.payment_method) filtered = filtered.filter(o => o.payment_method === filters.payment_method);

      let csv = '\uFEFFرقم الفاتورة,التاريخ,النوع,العميل,إجمالي الفاتورة,طريقة الدفع,الكاشير,الحالة\n';
      for (const o of filtered) {
        csv += `"${o.invoice_no || o.id}","${(o.created_at || '').slice(0, 19).replace('T', ' ')}","${o.order_type === 'dine_in' ? 'صالات' : o.order_type === 'takeaway' ? 'تيك أواي' : 'دليفري'}","${o.customer_name || '-'}","${o.total || 0}","${o.payment_method === 'cash' ? 'كاش' : o.payment_method === 'card' ? 'فيزا' : 'محفظة'}","${o.cashier_name || '-'}","${o.status === 'completed' ? 'مكتمل' : 'ملغي'}"\n`;
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_الطلبات_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  exportPayrollCsv: async (monthStr) => {
    try {
      const payroll = await mockApi.getMonthlyPayroll(monthStr);
      let csv = '\uFEFFاسم الموظف,الدور,الراتب الأساسي,أيام الحضور,أيام الغياب,خصم الغياب,الجزاءات,المكافآت,صافي الراتب المستحق\n';
      for (const r of payroll.records) {
        csv += `"${r.userName}","${r.userRole === 'admin' ? 'مدير' : 'كاشير'}","${r.baseSalary}","${r.shiftsAttended}","${r.absenceDays}","${r.absenceDeduction}","${r.penaltiesTotal}","${r.bonusesTotal}","${r.netSalary}"\n`;
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `مسير_الرواتب_${payroll.month}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  exportDailySalesCsv: async (dateFilter) => {
    try {
      const orders = getLocal('orders', []);
      const targetDate = dateFilter || new Date().toISOString().slice(0, 10);
      const dayOrders = orders.filter(o => (o.created_at || '').startsWith(targetDate) && o.status !== 'cancelled');
      let csv = '\uFEFFرقم الفاتورة,الوقت,النوع,المبلغ,طريقة الدفع,الكاشير\n';
      for (const o of dayOrders) {
        csv += `"${o.invoice_no || o.id}","${(o.created_at || '').slice(11, 19)}","${o.order_type}","${o.total}","${o.payment_method}","${o.cashier_name || '-'}"\n`;
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_مبيعات_${targetDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  printSilent: async () => ({ success: true }),
  printTicketHtml: async ({ html }) => {
    // In web dev mode, simulate successful printing
    console.log('printTicketHtml simulated successfully');
    return { success: true };
  },
  systemReset: async ({ keepMenu = true }) => {
    setLocal('orders', []);
    setLocal('shifts', []);
    setLocal('expenses', []);
    setLocal('debts', []);
    if (!keepMenu) {
      setLocal('products', []);
      setLocal('categories', DEFAULT_CATEGORIES.slice(0, 4));
    }
    return { success: true, message: keepMenu ? 'تم تصفير الحسابات مع الاحتفاظ بالمنيو' : 'تمت إعادة ضبط المصنع بالكامل' };
  },
  resetSystem: async (payload) => {
    return mockApi.systemReset(payload || {});
  },
  listDebtsGrouped: async () => {
    const debts = getLocal('debts', []);
    const map = {};
    for (const d of debts) {
      const key = d.customer_name || 'بدون اسم';
      if (!map[key]) {
        map[key] = {
          customer_name: key,
          customer_phone: d.customer_phone || '',
          total_amount: 0,
          paid_amount: 0,
          remaining_amount: 0,
          debts_count: 0
        };
      }
      map[key].total_amount += Number(d.total_amount) || 0;
      map[key].paid_amount += Number(d.paid_amount) || 0;
      map[key].remaining_amount += Number(d.remaining_amount) || 0;
      map[key].debts_count++;
    }
    return Object.values(map);
  },
  listDebtsGroupedByCustomer: async () => {
    return mockApi.listDebtsGrouped();
  },
  listCustomers: async () => {
    const custs = getLocal('customers', []);
    const orders = getLocal('orders', []);
    const debts = getLocal('debts', []);
    const map = {};

    for (const c of custs) {
      const key = (c.phone || c.name || '').trim();
      if (key) {
        map[key] = { id: c.id, name: c.name, phone: c.phone || '', address: c.address || '' };
      }
    }

    for (const o of orders) {
      const phoneKey = (o.customer_phone || o.customerPhone || '').trim();
      const nameKey = (o.customer_name || o.customerName || '').trim();
      const addr = (o.customer_address || o.customerAddress || '').trim();
      const key = phoneKey || nameKey;
      if (key) {
        if (map[key]) {
          if (!map[key].address && addr) map[key].address = addr;
        } else {
          map[key] = { id: `ord_${o.id}`, name: nameKey || 'عميل تيك أواي', phone: phoneKey, address: addr };
        }
      }
    }

    for (const d of debts) {
      if (d.customer_name && !map[d.customer_name]) {
        map[d.customer_name] = { id: d.id, name: d.customer_name, phone: d.customer_phone || '', address: d.customer_address || '' };
      }
    }
    return Object.values(map);
  },
  searchCustomers: async (query) => {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const custs = await mockApi.listCustomers();
    return custs.filter(c => (c.phone && c.phone.toLowerCase().includes(q)) || (c.name && c.name.toLowerCase().includes(q)));
  },
  saveCustomerDetails: async ({ phone, name = '', address = '' } = {}) => {
    if (typeof window !== 'undefined' && window.api && window.api.saveCustomerDetails) {
      return window.api.saveCustomerDetails({ phone, name, address });
    }
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone || cleanPhone.length < 3) return { success: false, error: 'رقم الهاتف غير صالح' };
    const custs = getLocal('customers', []);
    const existing = custs.find(c => c.phone === cleanPhone);
    if (existing) {
      if (name) existing.name = name;
      existing.address = address;
    } else {
      custs.unshift({
        id: Date.now(),
        name: name || 'عميل تيك أواي',
        phone: cleanPhone,
        address: address || '',
        created_at: new Date().toISOString()
      });
    }
    setLocal('customers', custs);
    return { success: true };
  },
  getCustomer: async (id) => {
    const custs = await mockApi.listCustomers();
    return custs.find(c => c.id === id) || null;
  },
  getCustomerDebts: async (customerId) => {
    const debts = getLocal('debts', []);
    return debts.filter(d => d.customer_id === customerId);
  },
  getPendingShiftBlockers: async (_shiftId) => ({
    openTablesCount: 0,
    pendingOrdersCount: 0
  }),
  getReportDaily: async (dateStr) => {
    const shifts = getLocal('shifts', []);
    const targetDate = dateStr || getLocalDateString(new Date());
    const dayShifts = shifts.filter(s => (s.opened_at ? getLocalDateString(s.opened_at) : '').startsWith(targetDate));
    return {
      date: targetDate,
      shifts: dayShifts.map(s => ({
        shift: s,
        totalSales: Number(s.total_sales) || 0,
        totalExpenses: Number(s.expenses_total) || 0,
        netCash: (Number(s.cash_sales) || 0) - (Number(s.expenses_total) || 0)
      })),
      grandTotal: {
        totalSales: dayShifts.reduce((acc, s) => acc + (Number(s.total_sales) || 0), 0),
        totalExpenses: dayShifts.reduce((acc, s) => acc + (Number(s.expenses_total) || 0), 0),
        netCash: dayShifts.reduce((acc, s) => acc + ((Number(s.cash_sales) || 0) - (Number(s.expenses_total) || 0)), 0)
      }
    };
  },
  listPrinters: async () => ([
    { name: 'الكاشير', isDefault: true },
    { name: 'بار', isDefault: false }
  ]),

  getLicenseStatus: async () => ({ isActivated: true, machineId: 'DEV-WEB-MOCK' }),
  activateLicense: async () => ({ success: true }),
  getMachineId: async () => 'DEV-WEB-MOCK',

  onQrOrderReceived: () => () => {},
  getQrInfo: async () => ({ ip: '127.0.0.1', port: 3000, url: 'http://127.0.0.1:3000/menu', tablesUrl: 'http://127.0.0.1:3000/qr-tables' }),

  getSession: async () => null,
  hasAdminUser: async () => {
    const users = await mockApi.listUsers();
    return Array.isArray(users) && users.some(u => u.role === 'admin');
  },
  setupInitialAdmin: async (password, name = 'مدير النظام', cafeInfo = null) => {
    if (!password || String(password).trim().length < 12) {
      return { success: false, error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل وتحتوي على أحرف وأرقام' };
    }
    const users = getLocal('users', []);
    users.push({
      id: 1,
      username: 'admin',
      name: name || 'مدير النظام',
      password: hashPassword(String(password).trim()),
      role: 'admin',
      phone: '01000000000',
      salary: 6000,
      shift_name: 'جميع الأوقات',
      shift_start: '00:00',
      shift_end: '23:59',
      must_change_password: 0,
      created_at: new Date().toISOString()
    });
    setLocal('users', users);
    if (cafeInfo && typeof cafeInfo === 'object') {
      await mockApi.saveSettings(cafeInfo);
    }
    return { success: true };
  },
  checkClock: async () => ({ valid: true, driftMinutes: 0 }),
  resetClockGuard: async (adminPassword) => {
    if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
      return { success: false, error: 'كلمة مرور المدير مطلوبة لإعادة مزامنة الساعة' };
    }
    const users = await mockApi.listUsers();
    const admin = users.find(u => (u.role === 'admin' || u.username === 'admin') && verifyPassword(adminPassword, u.password));
    if (!admin) return { success: false, error: 'كلمة مرور المدير غير صحيحة' };
    return { success: true };
  },
  clearTableCart: async (tableId) => mockApi.saveTableCart(tableId, null),
  resetAdminPassword: async (emergencyPin, newPass) => {
    // FIX BUG-02: حُذفت الأكواد الثابتة ('9999','1234')
    // إعادة تعيين كلمة المرور تتطلب كلمة المرور الحالية بدلاً من PIN ثابت
    if (!emergencyPin || typeof emergencyPin !== 'string' || !emergencyPin.trim()) {
      return { success: false, error: 'يرجى إدخال كلمة المرور الحالية' };
    }
    if (!newPass || typeof newPass !== 'string' || newPass.trim().length < 6) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' };
    }
    const users = await mockApi.listUsers();
    const admin = users.find(u => (u.role === 'admin' || u.username === 'admin') && verifyPassword(emergencyPin, u.password));
    if (!admin) return { success: false, error: 'كلمة المرور الحالية غير صحيحة' };
    admin.password = hashPassword(newPass);
    admin.must_change_password = 0;
    setLocal('users', users);
    return { success: true };
  },
  changeAdminPassword: async (oldPassword, newPassword) => {
    return mockApi.resetAdminPassword(oldPassword, newPassword);
  },
  notifyShiftState: async () => ({ success: true }),
  createMobilePairingSession: async () => ({
    code: '123456',
    qrPayload: 'taqfeela://pair?host=localhost&port=3000&code=123456',
    expiresAt: Date.now() + 600000,
    expiresInSec: 600,
    serverIp: '127.0.0.1',
    serverPort: 3000,
    cafeName: 'كافيه التكية'
  }),
  listPairedDevices: async () => [],
  revokeMobileDevice: async () => ({ success: true }),
  deleteMobileDevice: async () => ({ success: true }),
  getMobileInfo: async () => ({
    port: 3000,
    localIp: '127.0.0.1',
    pairedCount: 0,
    autoAppend: true
  })
};

// Lazy proxy: always reads window.api at call time so Electron preload is always used.
// F-08: In Electron, never silently fall back to mockApi (which stores fake data in localStorage).
const ALLOWED_ELECTRON_HELPERS = new Set(['toggleTableQr', 'regenerateTableQrToken', 'resetAllTableQrTokens', 'getQrInfo', 'onQrOrderReceived', 'searchCustomers', 'saveCustomerDetails', 'listCustomers', 'restoreOrder', 'hasAdminUser', 'setupInitialAdmin', 'changeAdminPassword', 'createMobilePairingSession', 'listPairedDevices', 'revokeMobileDevice', 'deleteMobileDevice', 'getMobileInfo']);
const api = new Proxy({}, {
  get(_target, prop) {
    if (typeof window !== 'undefined' && window.api) {
      if (typeof window.api[prop] === 'function') {
        return window.api[prop];
      }
      if (ALLOWED_ELECTRON_HELPERS.has(prop) && typeof mockApi[prop] === 'function') {
        return mockApi[prop];
      }
      throw new Error(`[API Error] الدالة '${String(prop)}' غير موجودة في واجهة التطبيق window.api`);
    }
    if (typeof mockApi[prop] === 'function') {
      return mockApi[prop];
    }
    return undefined;
  }
});

export default api;
