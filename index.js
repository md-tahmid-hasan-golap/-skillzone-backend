const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const port = process.env.PORT || 5000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "missing_key");

const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

// ─── MongoDB Setup ────────────────────────────────────────────────────────────
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();

    // ── Collections ───────────────────────────────────────────────────────────
    const SkillZoneCollection = client.db("SkillZone").collection("skills");
    const usersCollection = client.db("SkillZone").collection("users");

    // ── Skills Routes ─────────────────────────────────────────────────────────

    // GET /allSkills — fetch all skills
    app.get("/allSkills", async (req, res) => {
      const result = await SkillZoneCollection.find({
        $or: [{ status: "approved" }, { status: { $exists: false } }]
      }).toArray();
      res.send(result);
    });

    // GET /skillsDetails/:id — fetch a single skill by id
    app.get("/skillsDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await SkillZoneCollection.findOne(query);
      res.send(result);
    });

    // GET /latestSkills — fetch 8 most recent skills
    app.get("/latestSkills", async (req, res) => {
      const result = await SkillZoneCollection.find({
        $or: [{ status: "approved" }, { status: { $exists: false } }]
      }).sort({ createdAt: -1 }).limit(8).toArray();
      res.send(result);
    });

    // ── User Sync Route ───────────────────────────────────────────────────────

    /**
     * POST /user
     * Upserts a Clerk-authenticated user into the `users` collection.
     * Fixes the automatic role reset bug on refresh.
     */
    app.post("/user", async (req, res) => {
      const { clerkId, email, name, role } = req.body;

      // Validation
      if (!clerkId || !email) {
        return res.status(400).json({
          success: false,
          message: "clerkId and email are required.",
        });
      }

      try {
        const filter = { clerkId };

        const updateDoc = {
          // $set শুধু সেই ডেটা আপডেট করবে যা পরিবর্তন হওয়া উচিত (যেমন প্রোফাইল নেম)
          $set: {
            clerkId,
            email,
            name: name || "",
            updatedAt: new Date(),
          },
          // $setOnInsert শুধু নতুন ইউজার তৈরি হওয়ার সময় রান করবে
          $setOnInsert: {
            role: role || "user", // প্রথমবার একাউন্ট খোলার সময় ডিফল্ট 'user' হবে
            createdAt: new Date(),
          },
        };

        const options = { upsert: true };

        const result = await usersCollection.updateOne(filter, updateDoc, options);
        const isNewUser = result.upsertedCount > 0;

        return res.status(200).json({
          success: true,
          message: isNewUser
            ? "New user created successfully."
            : "Existing user updated successfully.",
          upsertedId: result.upsertedId ?? null,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("❌ Error saving user:", error.message);
        return res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
        });
      }
    });

    // ── GET /user/:clerkId — fetch a single user by Clerk ID ─────────────────
    app.get("/user/:clerkId", async (req, res) => {
      const { clerkId } = req.params;

      if (!clerkId) {
        return res.status(400).json({
          success: false,
          message: "clerkId param is required.",
        });
      }

      try {
        const user = await usersCollection.findOne({ clerkId });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        return res.status(200).json({
          success: true,
          user,
        });
      } catch (error) {
        console.error("❌ Error fetching user:", error.message);
        return res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
        });
      }
    });

    // ── GET /users — fetch all users ──────────────────────────────────────────
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();

        return res.status(200).json({
          success: true,
          count: users.length,
          users,
        });
      } catch (error) {
        console.error("❌ Error fetching users:", error.message);
        return res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
        });
      }
    });

    // ── Confirm Connection ────────────────────────────────────────────────────
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged your deployment. Connected to MongoDB!");
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("🚀 Welcome to SkillForge AI - AI-Powered Learning & Career Development Platform");
});

// ─── RBAC Middleware: checkRole ───────────────────────────────────────────────
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    const clerkId = req.headers["x-clerk-user-id"];

    if (!clerkId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No user identity provided.",
      });
    }

    try {
      const db = client.db("SkillZone");
      const usersCollection = db.collection("users");

      const user = await usersCollection.findOne({ clerkId });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User not found in database.",
        });
      }

      const userRole = user.role ?? "user";

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: Requires one of these roles — ${allowedRoles.join(", ")}.`,
        });
      }

      req.dbUser = user;
      next();
    } catch (error) {
      console.error("❌ checkRole error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Internal server error during role verification.",
      });
    }
  };
};

// ─── Protected Routes ─────────────────────────────────────────────────────────

// Admin-only: returns all users
app.get("/api/admin-data", checkRole(["admin"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const users = await db.collection("users").find().toArray();
    return res.status(200).json({
      success: true,
      message: "Admin data fetched successfully.",
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin + Manager: returns course analytics
app.get("/api/manager-data", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const skills = await db.collection("skills").find().toArray();
    return res.status(200).json({
      success: true,
      message: "Manager data fetched successfully.",
      totalSkills: skills.length,
      skills,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// All logged-in roles: returns the requesting user's own profile
app.get("/api/my-profile", checkRole(["admin", "manager", "user"]), (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Profile fetched successfully.",
    user: req.dbUser,
  });
});

// Admin + Manager: Manage Courses
app.post("/skills", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const newSkill = req.body;
    newSkill.createdAt = new Date();
    newSkill.creatorId = req.dbUser.clerkId;
    newSkill.status = req.dbUser.role === "admin" ? "approved" : "pending"; 
    const result = await db.collection("skills").insertOne(newSkill);
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/skills/:id", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const id = req.params.id;
    const db = client.db("SkillZone");
    
    if (req.dbUser.role === "manager") {
      const existing = await db.collection("skills").findOne({ _id: new ObjectId(id) });
      if (!existing || existing.creatorId !== req.dbUser.clerkId) {
        return res.status(403).json({ success: false, message: "Forbidden: You do not own this course." });
      }
    }

    const updatedData = { ...req.body };
    delete updatedData._id;
    delete updatedData.creatorId; 
    updatedData.updatedAt = new Date();

    const result = await db.collection("skills").updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/skills/:id", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const id = req.params.id;
    const db = client.db("SkillZone");
    
    if (req.dbUser.role === "manager") {
      const existing = await db.collection("skills").findOne({ _id: new ObjectId(id) });
      if (!existing || existing.creatorId !== req.dbUser.clerkId) {
        return res.status(403).json({ success: false, message: "Forbidden: You do not own this course." });
      }
    }

    const result = await db.collection("skills").deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/mySkills", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const result = await db.collection("skills").find({ creatorId: req.dbUser.clerkId }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approvals API for Manager/Admin
app.get("/api/approvals", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const pendingCourses = await db.collection("skills").find({ status: "pending" }).toArray();
    res.status(200).json({ success: true, pendingCourses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/approvals/:id", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const { id } = req.params;
    const { status } = req.body;

    const result = await db.collection("skills").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );
    res.status(200).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Dashboard APIs ───────────────────────────────────────────────────────────

app.get("/api/dashboard/overview", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const totalUsers = await db.collection("users").countDocuments();
    const totalSkills = await db.collection("skills").countDocuments();
    const totalAdmins = await db.collection("users").countDocuments({ role: "admin" });

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalSkills,
        totalAdmins,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/dashboard/chart-data", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");

    const userGrowth = await db
      .collection("users")
      .aggregate([
        {
          $group: {
            _id: { $month: "$createdAt" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            month: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ])
      .toArray();

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const formattedUserGrowth = userGrowth.map((item) => ({
      name: monthNames[(item.month || 1) - 1] || "Unknown",
      total: item.count,
    }));

    const categoryDistribution = await db
      .collection("skills")
      .aggregate([
        {
          $group: {
            _id: "$category",
            value: { $sum: 1 },
          },
        },
        {
          $project: {
            name: { $ifNull: ["$_id", "Uncategorized"] },
            value: 1,
            _id: 0,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      data: {
        revenueData: formattedUserGrowth,
        categoryData: categoryDistribution,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/dashboard/table-data", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const usersCursor = db
      .collection("users")
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const users = await usersCursor.toArray();
    const total = await db.collection("users").countDocuments();

    return res.status(200).json({
      success: true,
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Profile Update API ────────────────────────────────────────────────────────

app.patch("/api/users/profile", checkRole(["admin", "manager", "user"]), async (req, res) => {
  try {
    const clerkId = req.dbUser.clerkId;
    const { name, phone, bio } = req.body;
    const db = client.db("SkillZone");

    const updateDoc = {
      $set: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(bio && { bio }),
        updatedAt: new Date(),
      },
    };

    const result = await db.collection("users").updateOne({ clerkId }, updateDoc);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Admin Users API ──────────────────────────────────────────────────────────

app.get("/api/admin/users", checkRole(["admin"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const users = await db.collection("users").find().toArray();
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── AI Routes ────────────────────────────────────────────────────────────────

app.post("/api/ai/generate-description", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const { title, category } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Write a professional, engaging, and SEO-friendly description for a course or item.
Title: ${title}
Category: ${category || "General"}
The description should be 2-3 short paragraphs highlighting key benefits and what users will learn or experience. Make it persuasive and clear.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("AI Generation Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate AI content" });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const formattedHistory = (history || []).map((msg) => ({
      role: msg.role === "bot" || msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text }],
    }));

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: "Act as a helpful customer support assistant for a web platform called SkillForge. Be polite, concise, and professional. Always assist users with their inquiries related to courses or the platform." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I will act as a helpful customer support assistant for SkillForge." }],
        },
        ...formattedHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text();

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("AI Chat Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate chat response" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 SkillForge AI Server is running on port ${port}`);
});