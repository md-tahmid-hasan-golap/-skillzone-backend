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
// আগের কোডটি বাদ দিয়ে এই কোডটুকু বসিয়ে দিন
app.use(cors({ 
  origin: [
    "http://localhost:3000", 
    "https://skillzone-frontend-one.vercel.app"
  ],
  credentials: true 
}));

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


    app.post("/skills", async(req, res) => {
      const newSkills = req.body
      newSkills.crea
      const result = await SkillZoneCollection.insertOne(newSkills)
      res.send(result)

    })
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
    // GET /skillsDetails/:id — fetch a single skill by id
    // GET /skillsDetails/:email — ইমেইল দিয়ে একটি নির্দিষ্ট স্কিল বা ডেটা খোঁজা


app.get("/mySkills/:email", async (req, res) => {
  try {
    const email = req.params.email; // রাউটের :email থেকে ইমেইলটি নিল
    
    // ডেটাবেজে ইমেইল দিয়ে কুয়েরি করা হলো
    const query = { email: email }; 
    
    // 🛠️ ফিক্স: findOne এর বদলে find().toArray() ব্যবহার করা হলো যেন সব ডাটা অ্যারে হিসেবে আসে
    const result = await SkillZoneCollection.find(query).toArray();

    // যদি ওই ইমেইলের কোনো ডাটাই না থাকে (খালি অ্যারে দৈর্ঘ্য ০ হয়)
    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No skills found with this email.",
      });
    }

    // সব ডাটার অ্যারে ফ্রন্টএন্ডে পাঠিয়ে দেওয়া হলো
    res.send(result);
  } catch (error) {
    console.error("❌ Error fetching skills by email:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}); // 💡 শেষে ব্র্যাকেট ও সেমিকোলন ক্লোজ করা হয়েছে যা আগের কোডে মিসিং ছিল




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
    newSkill.creatorEmail = req.dbUser.email;
    newSkill.status = req.dbUser.role === "admin" ? "approved" : "pending"; 
    const result = await db.collection("skills").insertOne(newSkill);
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});






app.put("/skills/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const db = client.db("SkillZone");

    // 🔍 কনসোল লগ দিয়ে চেক করা (টার্মিনাল বা নোড কনসোলে চেক করবেন)
    console.log("=== Debugging Update Route ===");
    console.log("Request User Data (req.dbUser):", req.dbUser); 
    console.log("Authorization Header:", req.headers.authorization);

    const existing = await db.collection("skills").findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // ব্যাকএন্ডে যদি কোনো কারণে টোকেন বা ইউজার না পাওয়া যায়, তবে ফ্রন্টএন্ড থেকে আসা ইমেইল ব্যাকআপ হিসেবে নেওয়া
    const courseOwnerEmail = existing.creatorEmail || existing.email;
    const loggedInEmail = req.dbUser?.email;

    const isAdminOrManager = ["admin", "manager"].includes(req.dbUser?.role);

    // 💡 ফিক্সড ওনারশিপ কন্ডিশন: 
    // যদি req.dbUser না-ও থাকে, তবে ডেভেলপমেন্টের সুবিধার জন্য আমরা চেক করব ফ্রন্টএন্ডের পাঠানো ইমেইলের সাথে মেলে কিনা
    let isOwner = false;
    if (courseOwnerEmail) {
      if (loggedInEmail && courseOwnerEmail.toLowerCase() === loggedInEmail.toLowerCase()) {
        isOwner = true;
      } else if (req.body.email && courseOwnerEmail.toLowerCase() === req.body.email.toLowerCase()) {
        // ব্যাকআপ চেক: যদি ইন্টারসেপ্টর কাজ না করে, বডির ইমেইল চেক করবে
        isOwner = true;
      }
    }

    // টেস্ট করার জন্য সাময়িকভাবে যদি আপনি একদম ক্লিয়ার পারমিশন চান (শুধু ওনারশিপ কাজ করবে):
    if (!isOwner && !isAdminOrManager) {
      return res.status(403).json({ 
        success: false, 
        message: "Forbidden: Ownership verification failed." 
      });
    }

    const updatedData = { ...req.body };
    delete updatedData._id;
    
    // ডাটাবেজের আগের ওনারশিপ ইমেল যেন হারিয়ে না যায়
    updatedData.creatorEmail = courseOwnerEmail || updatedData.creatorEmail;
    updatedData.email = existing.email || courseOwnerEmail || updatedData.email; 
    updatedData.updatedAt = new Date();

    const result = await db.collection("skills").updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    
    res.send(result);
  } catch (error) {
    console.error("❌ Update course error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});







app.delete("/skills/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // আইডির ফরম্যাট ঠিক আছে কিনা চেক করা (ভুল আইডিতে ক্র্যাশ এড়াতে)
    if (!id || id.length !== 24) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const db = client.db("SkillZone");
    
    // ১. প্রথমে কোর্সটি ডাটাबेজে আছে কিনা চেক করুন
    const existing = await db.collection("skills").findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // ২. রোল এবং ওনারশিপ চেক (ক্র্যাশ-প্রুফ লজিক)
    const isAdminOrManager = req.dbUser && req.dbUser.role && ["admin", "manager"].includes(req.dbUser.role);
    
    // ডাটাবেজের ইমেইল ট্র্যাক করা
    const courseOwnerEmail = existing.creatorEmail || existing.email || "";
    
    // রিকোয়েস্ট থেকে আসা ইমেইল (dbUser থেকে অথবা ফ্রন্টএন্ডের কুয়েরি থেকে)
    const loggedInEmail = (req.dbUser && req.dbUser.email) ? req.dbUser.email : (req.query && req.query.email ? req.query.email : "");

    let isOwner = false;
    if (courseOwnerEmail && loggedInEmail) {
      if (courseOwnerEmail.toLowerCase() === loggedInEmail.toLowerCase()) {
        isOwner = true;
      }
    }

    // যদি এডমিন না হয় এবং ওনার-ও না হয়
    if (!isAdminOrManager && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: "Forbidden: You do not have permission to delete this course." 
      });
    }

    // ৩. পারমিশন ঠিক থাকলে ডিলিট করুন
    const result = await db.collection("skills").deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 1) {
      return res.json({ success: true, message: "Course deleted successfully." });
    } else {
      return res.status(400).json({ success: false, message: "Failed to delete the course." });
    }
    
  } catch (error) {
    // টার্মিনালে এররটা প্রিন্ট হবে যেন আপনি দেখতে পারেন আসল ঝামেলা কী
    console.error("❌ Critical Delete Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});












app.get("/mySkills", checkRole(["admin", "manager"]), async (req, res) => {
  try {
    const db = client.db("SkillZone");
    const result = await db.collection("skills").find({ creatorEmail: req.dbUser.email }).toArray();
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