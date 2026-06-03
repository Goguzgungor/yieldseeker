/**
 * One-shot MongoDB connectivity probe. Connects with MONGODB_URI, round-trips a
 * doc in the `yieldseeker` db, and prints the result. Run:
 *   npx tsx scripts/probe-mongo.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  const t0 = Date.now();
  await client.connect();
  const db = client.db("yieldseeker");
  const coll = db.collection("_probe");
  await coll.updateOne({ _id: "probe" as any }, { $set: { at: Date.now() } }, { upsert: true });
  const got = await coll.findOne({ _id: "probe" as any });
  await coll.deleteOne({ _id: "probe" as any });
  console.log(`OK connected in ${Date.now() - t0}ms; round-trip doc:`, got);
  await client.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("MONGO PROBE FAILED:", e?.message ?? e);
    process.exit(1);
  },
);
