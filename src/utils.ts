// --- 农历与常量 ---
export const CHINESE_NUMS = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const LUNAR_DAYS = [
  "", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"
];

export const SOLAR_TERMS: Record<string, string> = {
  '12-07': '大雪', '12-21': '冬至', '01-05': '小寒', '01-20': '大寒',
};

// --- 日期辅助函数 ---
export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
export const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const formatDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getLunarText = (day: number, _month: number) => {
   const lunarIndex = (day + 10) % 30 || 30; 
   return LUNAR_DAYS[lunarIndex];
};
