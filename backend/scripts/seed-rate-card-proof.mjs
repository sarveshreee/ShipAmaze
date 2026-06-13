import mongoose from "mongoose";

const DEFAULT_ZONES = ["A", "B", "C", "D", "E"];
const DEFAULT_WEIGHTS = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

const testRates = DEFAULT_ZONES.map((_, zi) =>
  DEFAULT_WEIGHTS.map((_, wi) => (zi === 0 && wi === 0 ? 123.45 : 30 + zi * 8 + wi * 15))
);

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI required");
  process.exit(1);
}

await mongoose.connect(uri);
await mongoose.connection.db.collection("shippingratecards").updateOne(
  { paymentType: "Prepaid" },
  {
    $set: {
      paymentType: "Prepaid",
      zones: DEFAULT_ZONES,
      weights: DEFAULT_WEIGHTS,
      rates: testRates,
      updatedAt: new Date(),
    },
  },
  { upsert: true }
);
const saved = await mongoose.connection.db.collection("shippingratecards").findOne({ paymentType: "Prepaid" });
console.log("PROOF Zone A 0.5kg Prepaid:", saved.rates[0][0]);
await mongoose.disconnect();
