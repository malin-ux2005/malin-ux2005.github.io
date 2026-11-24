// Transcribed label records. Require the catalog ID and title to still match.
const archivedLabels = {
  "000499": ["Куртка с косой молнией — Cultsome","Oversize"],
  "000506": ["Куртка с капюшоном — Armani Jeans","EU 42 / USA 6"],
  "000517": ["Леопардовый джемпер с коротким рукавом — Escada","34"],
  "000533": ["Футболка с синим волком — Gucci","XL"],
  "000559": ["Блузка — Monica Magni","44"],
  "000560": ["Юбка — Monica Magni","42"],
  "000612": ["Топ — Joli Brand","One Size"],
  "000621": ["Юбка — Графический принт","92"],
  "000660": ["Рубашка — Marjan","38"],
  "000663": ["Джинсы — Zara","38"],
  "000664": ["Джинсы — Monki","CN 165/86A"],
  "000671": ["Брюки — Застежка на пуговицы","EU 40"],
  "000675": ["Рубашка — Josephine & Co","38"],
  "000679": ["Брюки — D.Exterior","42"],
  "000683": ["Брюки — Bershka","34"],
  "000684": ["Брюки — VDR","IT 42"],
  "000689": ["Брюки — Steve","12"],
  "000690": ["Брюки — Mohito","32"],
  "000694": ["Рубашка — H&M","34"],
  "000704": ["Юбка — Вышивка","Талия 67 см"],
  "000752": ["Меховой аксессуар с высоким воротом — LIME","One Size"],
  "000768": ["Рубашка свободного кроя — WO LINE","One Size (52-60)"],
  "000770": ["Широкие джинсы — Рваные детали","42"],
  "000786": ["Широкие джинсы с нашивкой — Guess Jeans","W26 L30"],
  "000792": ["Боди с длинными рукавами — LUNEZZ","40/64"],
  "000818": ["Двубортный жакет — LKNLN","ONE SIZE"],
  "000848": ["Топ — Пуговицы и кружевная отделка","3"],
  "000861": ["Джинсовая мини-юбка с бахромой — Pandonableu","25"],
  "000862": ["Укороченная футболка с цветным принтом — LOOKONLINE","One Size"],
  "000876": ["Трикотажное макси-платье с вырезом — Kapsula","One Size"],
  "000884": ["Трикотажный топ на бретелях — Joli Brand","One Size (42-46)"],
  "000905": ["Бейсболка — Джинсовая с эффектом стирки","M (56 см)"],
  "000906": ["Бейсболка с вышивкой буквы E — Bershka","One Size (M)"],
  "000916": ["Трикотажная вещь с бахромой — Essibless","38"],
  "000961": ["Брюки-баллоны в клетку — LKNLN","One Size"],
  "000972": ["Укороченная рубашка со сборкой — LKNLN","One Size"],
  "001031": ["Жакет с фактурным узором — LKNLN", "One Size"],
  "001019": ["Классические брюки — Roberto Moretti","42"],
};

const unbranded = /^(?:[\s?!.—–−_/\\-]*|no[\s-]*(?:name|brand)|noname|unbranded|unknown(?: brand)?|n\/?a|none|null|ноу[\s-]?нейм|без (?:бренда|марки|бирки)|бренд (?:неизвестен|не указан|не указан на бирке|не определ[её]н)|неизвестн(?:ый(?: бренд)?|о|ая|ен)|не (?:указан[ао]?|определ[её]н[ао]?|установлен[ао]?)|нет(?: данных)?|уточнить(?: у менеджера)?|vi[wv][aá]ntica select|керамика|другое|vintage)$/iu;
const emptySize = /^(?:[?.—–-]*|без размера|нет(?: данных)?|не указан|уточнить(?: у менеджера)?!?)$/iu;
const oneSize = /^(?:one[\s-]*size|o\/?s|единый размер|универсальный)(?:\s*\([^)]*\))?$/iu;
export const catalogSizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];
const ruSizes = {44:'XS', 46:'S', 48:'M', 50:'L', 52:'XL', 54:'XXL'};
const labelBuckets = {'000517':'XS', '000683':'XS', '000694':'XS', '000786':'S'};

function gradedSize(label) {
  if (oneSize.test(label)) return 'One Size';
  const tagged = label.match(/(?:^|\()((?:XXL|XL|XS|S|M|L)(?:\s*[-–/]\s*(?:XXL|XL|XS|S|M|L))*)(?=\)|$|\s*\(\d)/i);
  if (tagged) return tagged[1].toUpperCase().replace(/\s*[-–/]\s*/g, '/');
  const ru = /^(?:RU\s*(\d{2}(?:[-–/]\d{2})?)|(\d{2}(?:[-–/]\d{2})?)\s*\(?RU\)?)$/i.exec(label.replace(/\s*([-–/])\s*/g, '$1'));
  if (!ru) return '';
  const numbers = (ru[1] || ru[2]).split(/[-–/]/).map(Number);
  if (!numbers.every(n => ruSizes[n])) return '';
  return Object.keys(ruSizes).map(Number).filter(n => n >= Math.min(...numbers) && n <= Math.max(...numbers)).map(n => ruSizes[n]).join('/');
}

export function matchesCatalogSize(size, option) {
  return size.split('/').includes(option);
}

const fibers = [
  ['Хлопок', /хлоп(?:ок|к(?:а|ом|ов[а-яё]+))/iu],
  ['Шерсть', /шерст(?:ь|и|ян[а-яё]+)/iu],
  ['Вискоза', /вискоз[а-яё]+/iu],
  ['Лён', /(?:льн(?:а|ом|ян[а-яё]+)|лён)/iu],
  ['Полиэстер', /полиэстер[а-яё]*/iu],
  ['Полиамид', /полиамид[а-яё]*/iu],
  ['Эластан', /эластан[а-яё]*/iu],
  ['Кашемир', /кашемир[а-яё]*/iu],
  ['Шёлк', /ш[её]лк(?:а|ов[а-яё]+)?/iu],
  ['Модал', /модал[а-яё]*/iu],
  ['Акрил', /акрил[а-яё]*/iu],
  ['Нейлон', /нейлон[а-яё]*/iu],
];

const materialNames = {
  хлопок:['Cotton','棉'], шерсть:['Wool','羊毛'], вискоза:['Viscose','粘胶纤维'], лён:['Linen','亚麻'], лен:['Linen','亚麻'],
  полиэстер:['Polyester','聚酯纤维'], полиамид:['Polyamide','聚酰胺'], эластан:['Elastane','氨纶'], кашемир:['Cashmere','羊绒'],
  шёлк:['Silk','丝'], модал:['Modal','莫代尔纤维'], акрил:['Acrylic','腈纶'], нейлон:['Nylon','尼龙'],
  полиуретан:['Polyurethane','聚氨酯'], вельвет:['Corduroy','灯芯绒'], керамика:['Ceramic','陶瓷'], 'масляные краски':['Oil paints','油画颜料'],
};

export function localizedMaterial(value, locale) {
  if (locale === 'ru') return value;
  return value.replace(/масляные краски|[а-яё]+/giu, word => materialNames[word.toLowerCase()]?.[locale === 'zh' ? 1 : 0] || word);
}

function catalogMaterial(material, description) {
  const value = material.trim();
  if (value && !/уточн|неизвест|не указан|нет данных|по бирке|^[—–? -]+$/iu.test(value)) return value;
  for (const sentence of description.split(/[.!?\n]/u)) {
    const fabric = sentence.trim().match(/^(?:(?:сшит[аоы]?|выполнен[аоы]?|изготовлен[аоы]?)\s+из\s+|(?:ткань|полотно|материал|состав)\s*(?:[-—–:]|из\s)\s*)(.+)$/iu)?.[1];
    if (!fabric || /имитаци|напомина|подклад|отделк|вставк|похож|вероят|искусственн|возможно|предполож|синтетич|смесов|смеси|примесь|шелковист|шелкограф|шёлковист|без\s/iu.test(fabric)) continue;
    const [base, addition] = fabric.split(/\s+с добавлением\s+/iu);
    if (/полушерст|стрейч-волокон/iu.test(fabric) || !fibers.some(([, pattern]) => pattern.test(base))) continue;
    if (addition && !fibers.some(([, pattern]) => pattern.test(addition))) continue;
    const matches = fibers.filter(([, pattern]) => pattern.test(fabric));
    return matches.map(([name], i) => i ? name.toLowerCase() : name).join(', ');
  }
  return '';
}
const wearClaim = /^(?:(?:новое изделие|новые изделия|вещь|изделие)[,\s]+)?(?:(?:(?:явных|видимых|заметных)\s+)?след(?:ы|ов|а)?\s+(?:носки|износа|эксплуатации|использования)\s*(?:[-:]\s*)?(?:отсутствуют|нет|не (?:обнаружено|обнаружены|выявлено|выявлены|замечено|замечены))|(?:без|нет)\s+(?:(?:видимых|явных|заметных)\s+)?следов\s+(?:носки|износа|эксплуатации|использования))[.!]?$/iu;

export function cleanBrand(text = '') {
  const value = text.trim();
  return unbranded.test(value) ? '' : value;
}

export function cleanDescription(text = '') {
  return text.replace(/[—–]/g, '-').split(/(?<=[.!?])\s+|[\r\n]+/u)
    .filter(sentence => !wearClaim.test(sentence.trim())).join(' ').trim();
}

export function catalogFields({ id, name, brand, section, category, labelSize, filterSize, measurements, description, condition, material = '' }) {
  const footwear = /обувь|footwear/i.test(section + ' ' + category);
  const apparel = section === 'Одежда' || footwear;
  const row = archivedLabels[String(id).replace(/\D/g, '')];
  const label = labelSize.trim();
  let detail = emptySize.test(label) ? '' : label;
  let measures = measurements.trim();
  const marked = measures.match(/(?:^|[;\n])\s*размер(?:\s+(?:обуви|на бирке))?\s*(?:[-—–:]\s*|\s+)([^;\n]+)/iu)?.[1]?.trim()
    || (footwear && /^(?:(?:EU|RU|UK|US)\s*)?\d{1,2}(?:[.,]\d+)?(?:\s*(?:EU|RU|UK|US))?$/i.test(measures) ? measures : '');
  if (!detail && marked && !emptySize.test(marked) && /\d|^(?:XXS|XS|S|M|L|XL|XXL|One Size)$/i.test(marked)) detail = marked;
  if (!detail && row && row[0] === name) {
    if (row[1] === 'Талия 67 см') {
      if (emptySize.test(measures)) measures = 'Талия по бирке - 67 см';
    } else detail = row[1];
  }
  const filter = filterSize.trim();
  if (!detail && !emptySize.test(filter) && !oneSize.test(filter)) detail = filter;
  if (!apparel && !detail && (label === 'Без размера' || oneSize.test(filter))) detail = 'One Size';
  if (footwear && detail && !oneSize.test(detail) && !marked) {
    const size = detail.replace(/\s*\([^)]*см\)\s*$/i, '');
    const other = !measures || emptySize.test(measures) ? '' : '; ' + measures;
    measures = 'Размер обуви - ' + size + other;
  }
  if (footwear && oneSize.test(detail)) detail = marked && !oneSize.test(marked) && !emptySize.test(marked) ? marked : '';
  const matchedLabel = row && row[0] === name && row[1] === detail;
  const size = footwear ? 'One Size' : gradedSize(detail)
    || (matchedLabel && labelBuckets[String(id).replace(/\D/g, '')])
    || (!oneSize.test(filter) && gradedSize(filter)) || '';
  if (detail.toLowerCase() === 'one size') detail = 'One Size';
  const cleanName = name.replace(/\s+(?:[—–/-])\s*(.*?)\s*$/u, (tail, value) => cleanBrand(value) ? tail : '');
  return {
    name: cleanName, brand: cleanBrand(brand), labelSize: detail, size,
    material: catalogMaterial(material, description), measurements: measures, description: cleanDescription(description),
    condition: /^как новая$/iu.test(condition.trim()) || wearClaim.test(condition.trim()) ? '' : condition,
  };
}


const columns = {
  id: 'ID вещи', name: 'Название для сайта', brand: 'Бренд', section: 'Раздел', category: 'Категория',
  labelSize: 'Размер на бирке', filterSize: 'Размер для фильтра', measurements: 'Замеры',
  description: 'Описание для сайта', condition: 'Состояние', material: 'Материал',
};

export function storefrontTable(table) {
  const headers = [...table.headers];
  if (!headers.includes(columns.filterSize)) headers.push(columns.filterSize);
  const indexes = Object.fromEntries(Object.entries(columns).map(([key, name]) => [key, headers.indexOf(name)]));
  const rows = table.rows.map(original => {
    const row = [...original];
    const values = Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, original[index] || '']));
    const fields = catalogFields(values);
    for (const [key, value] of Object.entries(fields)) {
      const index = indexes[key === 'size' ? 'filterSize' : key];
      if (index >= 0) row[index] = value;
    }
    return row;
  });
  return { ...table, headers, rows };
}
