const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;




// middle ware
app.use(cors());
app.use(express.json());





const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // collection 
    const SkillZoneCollection = client.db("SkillZone").collection("skills")


     // post skill
     app.post("/skills", async(req, res) => {
        const newSkill = req.body;
        newSkill.createdAt = new Date();
        const result = await SkillZoneCollection.insertOne(newSkill);
        res.send(result);
     })

      app.get("/allSkills", async(req, res) => {
        const result = await SkillZoneCollection.find().toArray()
        res.send(result)
      })

      

      app.get("/skillsDetails/:id", async(req, res) => {
        const id = req.params.id
        const queary = {_id: new ObjectId(id)}
        const result = await SkillZoneCollection.findOne(queary)
        res.send(result)
      })

   app.get("/latestSkills", async (req, res) => {
   const result = await SkillZoneCollection.find()
    .sort({ createdAt: -1 }) 
    .limit(8)                
    .toArray();
  res.send(result);
});





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
























app.get("/", (req, res) => {
  res.send("🚀 Welcome to SkillForge AI - AI-Powered Learning & Career Development Platform");
});

app.listen(port, () => {
  console.log(`🚀 SkillForge AI Server is running on port ${port}`);
});