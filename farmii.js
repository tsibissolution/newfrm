const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const token = process.env.token;

const requestToken = process.env.requestToken; // new CSRF / request token
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const api = axios.create({
  baseURL: "https://chainers.io/api/farm",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Origin": "https://static.chainers.io",
    "Referer": "https://static.chainers.io/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "x-request-token-id": requestToken,
  },
});
// 🌱 Seed array with growth times


const plantSeed = [
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"6978d555a9faa90b329f16f4","seedID":"67dc227a59b878f195998d70","growthTime": 19600000},
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"694cf65c7838d497137d99da","seedID":"67dc227a59b878f195998e60","growthTime": 28140000},  
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"694d05d5868cd847c642d56b","seedID":"673e0c942c7bfd708b352447","growthTime":120000}, 
  {"userGardensIDs":"694d05d5868cd847c642d56f","userBedsIDs":"6954f13d26c34db4967aed14","seedIDs":"673e0c942c7bfd708b35244d", "growthTime":120000},
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"694d078926c34db496e86725","seedID":"673e0c942c7bfd708b352465", "growthTime":240000},
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"6950e1fe868cd847c658079a","seedID":"67dc227a59b878f195998dac" , "growthTime":1920000},
  {"userGardensID":"694d05d5868cd847c642d56f","userBedsID":"6978d6a9a9faa90b329f83eb","seedID":"67dc227a59b878f195998f14" , "growthTime":1290000}

 
];



// 📊 Dashboard tracker
const bedStatus = new Map();
function showDashboard() {
  console.clear();
  console.log("🌾 CHAINERS FARM DASHBOARD 🌾");
  console.log("BED ID\t\t\tSEED ID\t\tREMAINING\tSTATUS");
  console.log("---------------------------------------------------------------");

  for (const [bedId, info] of bedStatus.entries()) {
    const remaining = info.remaining > 0 ? `${Math.floor(info.remaining / 1000)}s` : "0s";
    console.log(`${bedId}\t${info.seedId}\t${remaining}\t${info.status}`);
  }

  console.log("---------------------------------------------------------------");
  console.log("🕒 Updated:", new Date().toLocaleTimeString());
}

// 🚜 Harvest crop
async function harvestCrop(userFarmingID) {
  try {
    await api.post("/control/collect-harvest", {
        "userFarmingID": userFarmingID
    },);
    console.log(`✅ Harvested crop ${userFarmingID}`);
    return true;
  } catch (err) {
    console.error(`❌ Harvest failed for ${userFarmingID}:`, err.message);
    return false;
  }
}

// 🌱 Plant seed
async function plantSeedFunc(gardenId, bedId, seedId) {
  try {
    const res = await api.post("/control/plant-seed", {
      userGardensID: gardenId,
      userBedsID: bedId,
      seedID: seedId,
    });
    const userFarmingID = res.data?.data?.userFarmingID;
    console.log(`🌱 Planted seed ${seedId} on bed ${bedId} (farmID: ${userFarmingID})`);
    return userFarmingID;
  } catch (err) {
    console.error(`❌ Plant failed on bed ${bedId}: ${err.message}`);
    return null;
  }
}

// 🧩 Fetch all gardens
async function getGardens() {
  try {
    const res = await api.get("/user/gardens");
    return res.data.data || [];
  } catch (err) {
    console.error("❌ Error fetching gardens:", err.message);
    return [];
  }
}

// 🔁 Bed cycle: harvest if ready, else plant if empty
async function bedCycle(seedInfo) {
  const { userGardensIDs, userBedsIDs, seedIDs, growthTime } = seedInfo;
  let plantedAt = null;
  let userFarmingID = null;

  while (true) {
    // Check garden for existing planted seed
    const gardens = await getGardens();
    const garden = gardens.find(g => g.userGardensID === userGardensIDs);
    const bed = garden?.placedBeds?.find(b => b.userBedsID === userBedsIDs);

    if (bed?.plantedSeed) {
      userFarmingID = bed.plantedSeed.userFarmingID;
      plantedAt = new Date(bed.plantedSeed.plantedDate).getTime();
    }

    // If planted, check growth
    const now = Date.now();
    if (userFarmingID && plantedAt) {
      const elapsed = now - plantedAt;
      const remaining = growthTime - elapsed;

      bedStatus.set(userBedsIDs, {
        seedId: seedIDs,
        remaining: remaining > 0 ? remaining : 0,
        status: remaining > 0 ? "🌱 Growing" : "🌾 Ready to harvest",
      });

      if (remaining <= 0) {
        const harvested = await harvestCrop(userFarmingID);
        if (harvested) {
          await wait(20000); // 10s before replant
          userFarmingID = await plantSeedFunc(userGardensIDs, userBedsIDs, seedIDs);
          plantedAt = Date.now();
          bedStatus.set(userBedsIDs, {
            seedId: seedIDs,
            remaining: growthTime,
            status: "🌱 Replanted",
          });
        }
      }
    } else {
      // If not planted, plant
      await wait(20000); 
      userFarmingID = await plantSeedFunc(userGardensIDs, userBedsIDs, seedIDs);
      if (userFarmingID) plantedAt = Date.now();
      bedStatus.set(userBedsIDs, {
        seedId: seedIDs,
        remaining: growthTime,
        status: userFarmingID ? "🌱 Planted" : "⚠️ Plant failed",
      });
    }

    await wait(20000); // check every 5s
  }
}

// 🚀 Start farm
async function startFarm() {
  console.log("🌾 Starting Chainers farm automation...");

  // Start dashboard
  setInterval(showDashboard, 25000);

  // Start parallel bed cycles
  for (const seedInfo of plantSeed) {
    bedCycle(seedInfo);
    await wait(20000); // stagger bed starts to reduce rate-limit
  }
}

startFarm().catch(err => console.error("💥 Fatal error:", err.message));



