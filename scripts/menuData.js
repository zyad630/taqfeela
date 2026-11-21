module.exports = {
  categories: [
    { id: 1, name: 'جوبلت كوكيز', icon: '🍪', sort_order: 1 },
    { id: 2, name: 'حلويات', icon: '🍰', sort_order: 2 },
    { id: 3, name: 'وافلز', icon: '🧇', sort_order: 3 },
    { id: 4, name: 'سموزي', icon: '🥤', sort_order: 4 },
    { id: 5, name: 'موهيتو', icon: '🍹', sort_order: 5 },
    { id: 6, name: 'بان كيك', icon: '🥞', sort_order: 6 },
    { id: 7, name: 'سوفت درينك', icon: '🥫', sort_order: 7 },
    { id: 8, name: 'زبادو', icon: '🥛', sort_order: 8 },
    { id: 9, name: 'شيشة', icon: '💨', sort_order: 9 },
    { id: 10, name: 'إضافات', icon: '➕', sort_order: 10 },
    { id: 11, name: 'مشروبات ساخنة', icon: '☕', sort_order: 11 },
    { id: 12, name: 'هوت شوكلت', icon: '🍫', sort_order: 12 },
    { id: 13, name: 'ميلك تشيك', icon: '🍦', sort_order: 13 },
    { id: 14, name: 'عصائر فريش', icon: '🍊', sort_order: 14 },
    { id: 15, name: 'كوكتيلات', icon: '🍸', sort_order: 15 },
    { id: 16, name: 'فرابيه', icon: '🥤', sort_order: 16 },
    { id: 17, name: 'ايس كوفي', icon: '🧊', sort_order: 17 }
  ],
  products: [
    // 1. جوبلت كوكيز (Goblet Cookies)
    { name: 'جوبلت كوكيز صوص (نوتيلا - كندر - لوتس - كراميل - وايت شوكلت)', price: 70, cost: 25, category_id: 1, stock_qty: 100 },
    { name: 'جوبلت كوكيز هاف و هاف (2 صوص من اختيارك)', price: 80, cost: 28, category_id: 1, stock_qty: 100 },
    { name: 'جوبلت بستاشيو', price: 95, cost: 35, category_id: 1, stock_qty: 80 },
    { name: 'جوبلت أبل باي', price: 70, cost: 25, category_id: 1, stock_qty: 80 },
    { name: 'جوبلت بانانا باي', price: 70, cost: 25, category_id: 1, stock_qty: 80 },

    // 2. حلويات (Dessert)
    { name: 'أم علي مكسرات', price: 60, cost: 20, category_id: 2, stock_qty: 60 },
    { name: 'أم علي فواكه', price: 70, cost: 25, category_id: 2, stock_qty: 60 },
    { name: 'تشيز كيك صوص (نوتيلا - لوتس - كراميل - دارك - وايت)', price: 70, cost: 25, category_id: 2, stock_qty: 50 },
    { name: 'تشيز كيك بستاشيو', price: 90, cost: 35, category_id: 2, stock_qty: 40 },
    { name: 'مولتن كيك', price: 80, cost: 28, category_id: 2, stock_qty: 50 },
    { name: 'سينابون صوص (نوتيلا - لوتس - كراميل - دارك - وايت)', price: 70, cost: 24, category_id: 2, stock_qty: 50 },
    { name: 'سينابون بستاشيو', price: 90, cost: 32, category_id: 2, stock_qty: 40 },
    { name: 'فادج كيك', price: 70, cost: 24, category_id: 2, stock_qty: 50 },
    { name: 'فروت سلاد', price: 70, cost: 22, category_id: 2, stock_qty: 60 },

    // 3. وافلز (Waffles)
    { name: 'وافلز (نوتيلا - لوتس - وايت - كراميل - دارك - كندر)', price: 60, cost: 20, category_id: 3, stock_qty: 80 },
    { name: 'وافلز هاف و هاف (ميكس نوعين صوص)', price: 75, cost: 25, category_id: 3, stock_qty: 80 },
    { name: 'وافلز بستاشيو', price: 90, cost: 32, category_id: 3, stock_qty: 60 },
    { name: 'وافلز فواكه', price: 80, cost: 28, category_id: 3, stock_qty: 60 },
    { name: 'وافلز أبل باي', price: 75, cost: 25, category_id: 3, stock_qty: 60 },
    { name: 'وافلز بانانا باي', price: 75, cost: 25, category_id: 3, stock_qty: 60 },

    // 4. سموزي (Smoothie)
    { name: 'سموزي نكهات (فراولة - ميكس بيري - برتقال - بطيخ - باشون فروت - أناناس - جوافة)', price: 65, cost: 20, category_id: 4, stock_qty: 100 },
    { name: 'كولا كريز', price: 65, cost: 18, category_id: 4, stock_qty: 90 },
    { name: 'ليمون برتقال سموزي', price: 65, cost: 18, category_id: 4, stock_qty: 90 },
    { name: 'ليمون نعناع سموزي', price: 60, cost: 15, category_id: 4, stock_qty: 100 },

    // 5. موهيتو (Mojito)
    { name: 'موهيتو كلاسيك', price: 50, cost: 15, category_id: 5, stock_qty: 100 },
    { name: 'موهيتو فليفر (بلوبيري - فراولة - باشون فروت - مانجا - أناناس - كريز)', price: 65, cost: 20, category_id: 5, stock_qty: 100 },
    { name: 'موهيتو ريدبول', price: 90, cost: 45, category_id: 5, stock_qty: 70 },
    { name: 'موهيتو جيلي كولا', price: 70, cost: 22, category_id: 5, stock_qty: 80 },

    // 6. بان كيك (Pancakes)
    { name: 'بان كيك 12 قطعة (نوتيلا - لوتس - كراميل - دارك - كندر)', price: 60, cost: 20, category_id: 6, stock_qty: 80 },
    { name: 'بان كيك 12 قطعة هاف و هاف (ميكس صوص من اختيارك)', price: 70, cost: 24, category_id: 6, stock_qty: 80 },
    { name: 'بان كيك 12 قطعة بستاشيو', price: 80, cost: 28, category_id: 6, stock_qty: 70 },
    { name: 'بان كيك 24 قطعة (نوتيلا - لوتس - كراميل - دارك - كندر)', price: 90, cost: 30, category_id: 6, stock_qty: 70 },
    { name: 'بان كيك 24 قطعة هاف و هاف (ميكس صوص من اختيارك)', price: 100, cost: 35, category_id: 6, stock_qty: 70 },
    { name: 'بان كيك 24 قطعة بستاشيو', price: 110, cost: 40, category_id: 6, stock_qty: 60 },

    // 7. سوفت درينك (Soft Drinks)
    { name: 'كولا', price: 30, cost: 18, category_id: 7, stock_qty: 150 },
    { name: 'فيروز', price: 35, cost: 20, category_id: 7, stock_qty: 120 },
    { name: 'بريل', price: 35, cost: 20, category_id: 7, stock_qty: 100 },
    { name: 'جولد', price: 35, cost: 20, category_id: 7, stock_qty: 100 },
    { name: 'ريدبول', price: 80, cost: 45, category_id: 7, stock_qty: 80 },
    { name: 'فيوري', price: 35, cost: 20, category_id: 7, stock_qty: 100 },
    { name: 'استنج', price: 35, cost: 20, category_id: 7, stock_qty: 100 },
    { name: 'مياه صغيرة', price: 10, cost: 4, category_id: 7, stock_qty: 250 },
    { name: 'مياه كبيرة', price: 15, cost: 7, category_id: 7, stock_qty: 150 },

    // 8. زبادو (Yogurt)
    { name: 'زبادو عسل', price: 45, cost: 16, category_id: 8, stock_qty: 80 },
    { name: 'زبادو فراولة', price: 60, cost: 20, category_id: 8, stock_qty: 80 },
    { name: 'زبادو مانجا', price: 60, cost: 20, category_id: 8, stock_qty: 80 },
    { name: 'زبادو موز', price: 60, cost: 20, category_id: 8, stock_qty: 80 },
    { name: 'زبادو كيوي', price: 70, cost: 25, category_id: 8, stock_qty: 70 },
    { name: 'زبادو أفوكادو', price: 90, cost: 35, category_id: 8, stock_qty: 60 },

    // 9. شيشة (Shesha)
    { name: 'شيشة كلاسيك', price: 25, cost: 8, category_id: 9, stock_qty: 200 },
    { name: 'شيشة فواكه', price: 50, cost: 15, category_id: 9, stock_qty: 150 },
    { name: 'شيشة ميكس', price: 55, cost: 18, category_id: 9, stock_qty: 150 },
    { name: 'شيشة مخصوص', price: 65, cost: 22, category_id: 9, stock_qty: 120 },

    // 10. إضافات (Adds)
    { name: 'إضافة ثلج', price: 5, cost: 1, category_id: 10, stock_qty: 500 },
    { name: 'إضافة فليفر', price: 10, cost: 3, category_id: 10, stock_qty: 300 },
    { name: 'إضافة حليب', price: 10, cost: 4, category_id: 10, stock_qty: 300 },
    { name: 'بولة ايس كريم', price: 20, cost: 7, category_id: 10, stock_qty: 150 },
    { name: 'مكسرات مخصوص', price: 20, cost: 8, category_id: 10, stock_qty: 150 },
    { name: 'كريم شانتيه', price: 10, cost: 3, category_id: 10, stock_qty: 200 },
    { name: 'إضافة فواكه', price: 15, cost: 5, category_id: 10, stock_qty: 200 },

    // 11. مشروبات ساخنة (Hot Drinks)
    { name: 'قهوة تركي سنجل', price: 25, cost: 7, category_id: 11, stock_qty: 250 },
    { name: 'قهوة تركي دبل', price: 40, cost: 12, category_id: 11, stock_qty: 250 },
    { name: 'اسبريسو سنجل', price: 40, cost: 12, category_id: 11, stock_qty: 200 },
    { name: 'اسبريسو دبل', price: 50, cost: 18, category_id: 11, stock_qty: 200 },
    { name: 'اسبريسو ميكاتو سنجل', price: 45, cost: 14, category_id: 11, stock_qty: 150 },
    { name: 'اسبريسو ميكاتو دبل', price: 55, cost: 19, category_id: 11, stock_qty: 150 },
    { name: 'كورتادو', price: 55, cost: 18, category_id: 11, stock_qty: 120 },
    { name: 'كراميل ميكاتو (اسبريسو + حليب + فليفر فانيليا + صوص كراميل)', price: 70, cost: 24, category_id: 11, stock_qty: 120 },
    { name: 'فلات وايت', price: 60, cost: 20, category_id: 11, stock_qty: 120 },
    { name: 'لاتيه', price: 60, cost: 20, category_id: 11, stock_qty: 150 },
    { name: 'اسبانش لاتيه', price: 65, cost: 22, category_id: 11, stock_qty: 130 },
    { name: 'بستاشيو لاتيه', price: 75, cost: 28, category_id: 11, stock_qty: 100 },
    { name: 'كابتشينو', price: 60, cost: 20, category_id: 11, stock_qty: 150 },
    { name: 'امريكانو', price: 60, cost: 18, category_id: 11, stock_qty: 150 },
    { name: 'موكا (دارك - وايت)', price: 65, cost: 22, category_id: 11, stock_qty: 120 },
    { name: 'ابل سيدر', price: 45, cost: 14, category_id: 11, stock_qty: 100 },
    { name: 'فيتامين سي (برتقال + عسل + ليمون + جوافة)', price: 60, cost: 20, category_id: 11, stock_qty: 100 },
    { name: 'شاي', price: 15, cost: 3, category_id: 11, stock_qty: 300 },
    { name: 'شاي أخضر', price: 20, cost: 4, category_id: 11, stock_qty: 200 },
    { name: 'سحلب مكسرات', price: 45, cost: 14, category_id: 11, stock_qty: 120 },
    { name: 'سحلب فواكه', price: 55, cost: 18, category_id: 11, stock_qty: 100 },
    { name: 'نسكافيه بلاك', price: 40, cost: 12, category_id: 11, stock_qty: 180 },
    { name: 'نسكافيه حليب', price: 50, cost: 16, category_id: 11, stock_qty: 180 },
    { name: 'كاكاو حليب', price: 50, cost: 16, category_id: 11, stock_qty: 150 },

    // 12. هوت شوكلت (Hot Chocolate)
    { name: 'هوت شوكلت (نوتيلا - وايت - كندر)', price: 60, cost: 20, category_id: 12, stock_qty: 100 },
    { name: 'هوت شوكلت دارك', price: 55, cost: 18, category_id: 12, stock_qty: 100 },
    { name: 'هوت شوكلت مارشميلو', price: 70, cost: 24, category_id: 12, stock_qty: 80 },

    // 13. ميلك تشيك (Milk Shake)
    { name: 'ميلك تشيك (شوكلت - فانيليا - فراولة - مانجا)', price: 70, cost: 22, category_id: 13, stock_qty: 100 },
    { name: 'ميلك تشيك (بلوبيري - مكس بيري - بطيخ)', price: 75, cost: 25, category_id: 13, stock_qty: 90 },
    { name: 'ميلك تشيك (نوتيلا - لوتس - كراميل - كندر)', price: 75, cost: 25, category_id: 13, stock_qty: 90 },
    { name: 'ميلك تشيك بستاشيو', price: 85, cost: 30, category_id: 13, stock_qty: 80 },
    { name: 'ميلك تشيك أوريو', price: 75, cost: 25, category_id: 13, stock_qty: 100 },

    // 14. عصائر فريش (Fresh Juices)
    { name: 'عصير مانجو فريش', price: 60, cost: 20, category_id: 14, stock_qty: 120 },
    { name: 'عصير فراولة فريش', price: 55, cost: 18, category_id: 14, stock_qty: 120 },
    { name: 'عصير فراولة حليب', price: 60, cost: 20, category_id: 14, stock_qty: 100 },
    { name: 'عصير برتقال فريش', price: 55, cost: 16, category_id: 14, stock_qty: 120 },
    { name: 'عصير جوافة فريش', price: 50, cost: 15, category_id: 14, stock_qty: 120 },
    { name: 'عصير جوافة حليب', price: 55, cost: 18, category_id: 14, stock_qty: 100 },
    { name: 'عصير كانتلوب فريش', price: 50, cost: 15, category_id: 14, stock_qty: 100 },
    { name: 'عصير كانتلوب حليب', price: 55, cost: 18, category_id: 14, stock_qty: 90 },
    { name: 'عصير أناناس فريش', price: 50, cost: 16, category_id: 14, stock_qty: 90 },
    { name: 'عصير كيوي فريش', price: 60, cost: 20, category_id: 14, stock_qty: 90 },
    { name: 'عصير بطيخ فريش', price: 60, cost: 18, category_id: 14, stock_qty: 100 },
    { name: 'موز حليب', price: 60, cost: 18, category_id: 14, stock_qty: 110 },
    { name: 'بلح حليب', price: 60, cost: 18, category_id: 14, stock_qty: 100 },
    { name: 'أفوكادو حليب', price: 80, cost: 30, category_id: 14, stock_qty: 70 },
    { name: 'عصير ليمون فريش', price: 40, cost: 10, category_id: 14, stock_qty: 150 },
    { name: 'عصير ليمون نعناع فريش', price: 45, cost: 12, category_id: 14, stock_qty: 150 },

    // 15. كوكتيلات (Cocktails)
    { name: 'كوكتيل مانجو فراولة', price: 70, cost: 22, category_id: 15, stock_qty: 80 },
    { name: 'كوكتيل مانجو كيوي', price: 75, cost: 25, category_id: 15, stock_qty: 80 },
    { name: 'كوكتيل خوخ مانجو', price: 75, cost: 25, category_id: 15, stock_qty: 80 },
    { name: 'كوكتيل جوافة موز', price: 65, cost: 20, category_id: 15, stock_qty: 80 },
    { name: 'كوكتيل جوافة نعناع', price: 60, cost: 18, category_id: 15, stock_qty: 80 },
    { name: 'با تنش بلانش (أناناس كيوي + برتقال + تفاح)', price: 75, cost: 25, category_id: 15, stock_qty: 70 },
    { name: 'سويت & سور (بطيخ كيوي + فراولة + ليمون)', price: 70, cost: 24, category_id: 15, stock_qty: 70 },
    { name: 'لافلى التكية (مكس توت + موز + فراولة + ايس كريم فانيليا)', price: 75, cost: 26, category_id: 15, stock_qty: 80 },
    { name: 'جرين باور (أفوكادو + كيوي + مكسرات + عسل + حليب + ايس كريم فانيليا)', price: 90, cost: 35, category_id: 15, stock_qty: 70 },
    { name: 'بانانا جرين (موز + أفوكادو + لوز)', price: 85, cost: 30, category_id: 15, stock_qty: 70 },
    { name: 'باور التكية (موز + حليب + عسل + أفوكادو + مكسرات + قرفة + زبدة فول سوداني + بلح)', price: 100, cost: 40, category_id: 15, stock_qty: 70 },
    { name: 'جولد كيوي (أناناس كيوي + موز)', price: 75, cost: 25, category_id: 15, stock_qty: 70 },

    // 16. فرابيه (Frappe)
    { name: 'فرابتشينو كلاسيك', price: 65, cost: 20, category_id: 16, stock_qty: 80 },
    { name: 'فرابتشينو فليفر (فانيليا - دارك - كراميل)', price: 70, cost: 23, category_id: 16, stock_qty: 80 },
    { name: 'فرابيبه لوتس', price: 70, cost: 24, category_id: 16, stock_qty: 80 },
    { name: 'فرابيبه كندر', price: 70, cost: 24, category_id: 16, stock_qty: 80 },

    // 17. ايس كوفي (Iced Coffee)
    { name: 'ايس لاتيه', price: 60, cost: 20, category_id: 17, stock_qty: 100 },
    { name: 'اسبانيش لاتيه بارد', price: 70, cost: 24, category_id: 17, stock_qty: 100 },
    { name: 'ايس موكا (وايت - دارك)', price: 70, cost: 24, category_id: 17, stock_qty: 90 },
    { name: 'ايس امريكانو', price: 60, cost: 18, category_id: 17, stock_qty: 100 },
    { name: 'ايس كراميل ميكاتو', price: 70, cost: 24, category_id: 17, stock_qty: 90 }
  ]
};
