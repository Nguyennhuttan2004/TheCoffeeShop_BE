const SupportThread = require("../../models/SupportThread");

exports.startOrAppendUserMessage = async (req, res) => {
  try {
    const { userEmail, userName, message } = req.body;

    let thread = await SupportThread.findOne({ userEmail });

    if (!thread) {
      thread = new SupportThread({
        userEmail,
        userName,
        messages: [{ sender: "user", content: message }],
      });
    } else {
      thread.messages.push({ sender: "user", content: message });
      thread.updatedAt = new Date();
    }

    await thread.save();
    res.status(200).json(thread);
  } catch (error) {
    console.error("startOrAppendUserMessage error:", error);
    res.status(500).json({ error: "Failed to start or update thread" });
  }
};

// 2. Admin gửi tin nhắn
exports.sendAdminMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const thread = await SupportThread.findById(id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    thread.messages.push({ sender: "admin", content });
    thread.updatedAt = new Date();
    await thread.save();

    res.status(200).json(thread);
  } catch (error) {
    console.error("sendAdminMessage error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// 3. Admin xem toàn bộ hội thoại
exports.getAllThreads = async (req, res) => {
  try {
    const threads = await SupportThread.find().sort({ updatedAt: -1 });
    res.status(200).json(threads);
  } catch (error) {
    console.error("getAllThreads error:", error);
    res.status(500).json({ error: "Failed to get threads" });
  }
};

// 4. Lấy theo ID (admin)
exports.getThreadById = async (req, res) => {
  try {
    const thread = await SupportThread.findById(req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    res.status(200).json(thread);
  } catch (error) {
    console.error("getThreadById error:", error);
    res.status(500).json({ error: "Failed to get thread" });
  }
};

// 5. Lấy theo email (user)
exports.getThreadByEmail = async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const thread = await SupportThread.findOne({ userEmail: email });

    if (!thread) return res.status(404).json({ error: "Thread not found" });

    res.status(200).json(thread);
  } catch (error) {
    console.error("getThreadByEmail error:", error);
    res.status(500).json({ error: "Failed to get thread by email" });
  }
};