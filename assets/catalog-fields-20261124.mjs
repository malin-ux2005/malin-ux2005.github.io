// Transcribed label records. Require the catalog ID and title to still match.
const archivedLabels = {
  "000499": ["Куртка с косой молнией — Cultsome","Oversize"],
  "000506": ["Куртка с капюшоном — Armani Jeans","EU 42 / USA 6"],
  "000517": ["Леопардовый джемпер с коротким рукавом — Escada","34"],
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
const alpha = /(?:^|[\s(/])((?:XX[SL]|X[SL]|[SML]|XXL\+))(?:$|[\s)/])/i;
const wearClaim = /^(?:(?:новое изделие|новые изделия|вещь|изделие)[,\s]+)?(?:(?:(?:явных|видимых|заметных)\s+)?след(?:ы|ов|а)?\s+(?:носки|износа|эксплуатации|использования)\s*(?:[-:]\s*)?(?:отсутствуют|нет|не (?:обнаружено|обнаружены|выявлено|выявлены|замечено|замечены))|(?:без|нет)\s+(?:(?:видимых|явных|заметных)\s+)?следов\s+(?:носки|износа|эксплуатации|использования))[.!]?$/iu;

export function cleanBrand(text = '') {
  const value = text.trim();
  return unbranded.test(value) ? '' : value;
}

export function cleanDescription(text = '') {
  return text.replace(/[—–]/g, '-').split(/(?<=[.!?])\s+|[\r\n]+/u)
    .filter(sentence => !wearClaim.test(sentence.trim())).join(' ').trim();
}

export function catalogFields({ id, name, brand, section, category, labelSize, filterSize, measurements, description, condition }) {
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
  let size = detail.match(alpha)?.[1]?.toUpperCase() || detail;
  if (footwear || oneSize.test(detail)) size = 'One Size';
  if (detail.toLowerCase() === 'one size') detail = 'One Size';
  const cleanName = name.replace(/\s+(?:[—–/-])\s*(.*?)\s*$/u, (tail, value) => cleanBrand(value) ? tail : '');
  return {
    name: cleanName, brand: cleanBrand(brand), labelSize: detail, size,
    measurements: measures, description: cleanDescription(description),
    condition: /^как новая$/iu.test(condition.trim()) || wearClaim.test(condition.trim()) ? '' : condition,
  };
}


const columns = {
  id: 'ID вещи', name: 'Название для сайта', brand: 'Бренд', section: 'Раздел', category: 'Категория',
  labelSize: 'Размер на бирке', filterSize: 'Размер для фильтра', measurements: 'Замеры',
  description: 'Описание для сайта', condition: 'Состояние',
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
