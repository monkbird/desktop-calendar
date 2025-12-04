import { Solar, Lunar, HolidayUtil } from 'lunar-typescript'; // 新增 HolidayUtil

export const CHINESE_NUMS = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
export const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const formatDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export interface DateInfo {
  lunarText: string;
  term: string;
  festival: string;
  fullLunar: string;
  workStatus: 'rest' | 'work' | null; // 新增字段：rest=休, work=班, null=无
}

export const getDateInfo = (date: Date): DateInfo => {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

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

  const fullLunar = lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();

  // --- 新增：获取节假日调休信息 ---
  const holiday = HolidayUtil.getHoliday(y, m, d);
  let workStatus: 'rest' | 'work' | null = null;
  
  if (holiday) {
    // isWork() 为 true 表示调休上班（班），false 表示放假（休）
    workStatus = holiday.isWork() ? 'work' : 'rest';
  }

  return {
    lunarText,
    term,
    festival,
    fullLunar,
    workStatus // 返回状态
  };
};
