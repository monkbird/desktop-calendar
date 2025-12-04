import { Solar, Lunar } from 'lunar-typescript';

export const CHINESE_NUMS = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
export const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const formatDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export interface DateInfo {
  lunarText: string; // 简写（用于日历格子，如“初九”）
  term: string;      // 节气
  festival: string;  // 节日
  fullLunar: string; // 完整农历（用于悬浮窗，如“十月初九”）
}

export const getDateInfo = (date: Date): DateInfo => {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();

  const term = lunar.getJieQi();

  let festival = '';
  const lunarFestivals = lunar.getFestivals();
  const solarFestivals = solar.getFestivals();

  if (lunarFestivals.length > 0) {
    festival = lunarFestivals[0];
  } else if (solarFestivals.length > 0) {
    festival = solarFestivals[0];
  }

  let lunarText = lunar.getDayInChinese();
  if (lunar.getDay() === 1) {
    lunarText = lunar.getMonthInChinese() + '月';
  }

  // 拼接完整农历字符串，例如：十月 + 初九 = 十月初九
  const fullLunar = lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();

  return {
    lunarText,
    term,
    festival,
    fullLunar // 返回新增的字段
  };
};
