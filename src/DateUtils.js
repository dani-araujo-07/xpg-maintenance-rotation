// ============================================================
// DATE UTILITIES - Reusable across scripts
// ============================================================

const DateUtils = {
  getTodayAtMidnight() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  },

  atMidnight(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  },
  
  isFriday(date) {
    return date.getDay() === 5;
  },
  
  isMonday(date) {
    return date.getDay() === 1;
  },
  
  getNextMonday(date) {
    const nextMonday = new Date(date);
    nextMonday.setDate(nextMonday.getDate() + (8 - date.getDay()) % 7);
    return nextMonday;
  },
  
  getPreviousFriday(date) {
    const previousFriday = new Date(date);
    previousFriday.setDate(previousFriday.getDate() - ((date.getDay() + 2) % 7));
    return previousFriday;
  },
  
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },
  
  subtractDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  },

  isSameDay(a, b) {
    return this.atMidnight(a).getTime() === this.atMidnight(b).getTime();
  }
};

function getTimeZone() {
  return Session.getScriptTimeZone();
}
