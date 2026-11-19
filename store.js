const { Firestore } = require("@google-cloud/firestore");

const db = new Firestore();
const habits = db.collection("habits");
const checkins = db.collection("checkins");

exports.getState = async () => {
  const [habitDocs, checkinDocs] = await Promise.all([habits.get(), checkins.get()]);
  return { habits: habitDocs.docs.map((doc) => doc.data()), checkins: checkinDocs.docs.map((doc) => doc.data()) };
};

exports.saveHabit = (habit) => habits.doc(habit.id).set(habit);

exports.saveCheckin = (checkin) => db.runTransaction(async (transaction) => {
  const habit = await transaction.get(habits.doc(checkin.habitId));
  if (!habit.exists) throw Object.assign(new Error("Habit not found"), { status: 404 });
  const ref = checkins.doc(`${checkin.habitId}_${checkin.date}`);
  if (checkin.value) transaction.set(ref, checkin);
  else transaction.delete(ref);
});
