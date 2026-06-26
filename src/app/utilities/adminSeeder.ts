import { User } from "../modules/user/user.model";
import config from "../config";

export const seedSuperAdmin = async () => {
  try {
    const email = config.admin_email;
    const password = config.admin_password;

    if (!email || !password) {
      console.warn("⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed");
      return;
    }

    // Look up by the configured email (not just "any admin"), so changing
    // ADMIN_EMAIL in .env will seed the new admin on next start.
    const existing = await User.findOne({ email });
    if (existing) {
      // make sure the account is a usable admin (verified + active)
      let changed = false;
      if (existing.role !== "admin") {
        existing.role = "admin";
        changed = true;
      }
      if (!existing.isVerified) {
        existing.isVerified = true;
        changed = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        changed = true;
      }
      if (changed) {
        await existing.save();
        console.log(`✅ Existing admin (${email}) updated to verified & active`);
      }
      return;
    }

    await User.create({
      name: "Super Admin",
      email,
      password, // hashed by the user model pre-save hook
      role: "admin",
      isActive: true,
      isVerified: true,
    });

    console.log("✅ Super admin created successfully");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log("   ⚠️  Please change the password after first login!");
  } catch (error) {
    console.error("❌ Error seeding super admin:", error);
  }
};
