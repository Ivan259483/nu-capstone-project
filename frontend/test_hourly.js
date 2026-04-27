const fs = require('fs');

const data = {
  transactions: [
    { dateTime: "2026-04-26T10:19:48Z", total: 1500, status: "completed" },
    { dateTime: "2026-04-26T01:00:00Z", total: 2000, status: "completed" }
  ]
};

const today = new Date();
today.setHours(0, 0, 0, 0);
console.log("Today:", today);

const todayTxns = data.transactions.filter(t => new Date(t.dateTime) >= today);
console.log("Today txns:", todayTxns);

const hourlyMap = {};
for (let i = 8; i <= 18; i++) {
  const hourLabel = i === 12 ? '12PM' : i > 12 ? `${i - 12}PM` : `${i}AM`;
  hourlyMap[hourLabel] = { revenue: 0, transactions: 0 };
}

todayTxns.forEach(t => {
  if (t.status !== 'voided') {
    const h = new Date(t.dateTime).getHours();
    console.log("Txn hour:", h);
    if (h >= 8 && h <= 18) {
      const hourLabel = h === 12 ? '12PM' : h > 12 ? `${h - 12}PM` : `${h}AM`;
      hourlyMap[hourLabel].revenue += t.total;
      hourlyMap[hourLabel].transactions += 1;
    } else {
      console.log("Dropped txn because hour is outside 8-18:", h);
    }
  }
});
console.log(hourlyMap);
