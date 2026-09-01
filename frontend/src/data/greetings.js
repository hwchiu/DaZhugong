export const LUNCH_GREETINGS = [
  '午餐時間 專心吃飯聊天吧！公事等下午再說喔 😊',
  '吃飯配公事，容易噎著喔～放輕鬆一點！',
  '午休片刻，讓大腦也放個假吧 🍱',
  '邊吃邊聊生活瑣事就好，deadline 先放一邊！',
  '今天想聊什麼都行，就是不能聊工作 😄',
  '嘴巴動、腦袋停，午餐才吃得香 🍜',
];

export function pickRandomGreeting(list = LUNCH_GREETINGS) {
  if (!Array.isArray(list) || list.length === 0) {
    return '';
  }

  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

export default LUNCH_GREETINGS;
