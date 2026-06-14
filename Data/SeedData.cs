using Microsoft.AspNetCore.Identity;
using TeacherReporter.Models;

namespace TeacherReporter.Data
{
    public static class SeedData
    {
        public static async Task Initialize(IServiceProvider serviceProvider)
        {
            var roleManager = serviceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var userManager = serviceProvider.GetRequiredService<UserManager<ApplicationUser>>();

            // Create roles if they don't exist
            string[] roles = { "Admin", "Teacher" };
            foreach (var role in roles)
            {
                if (!await roleManager.RoleExistsAsync(role))
                    await roleManager.CreateAsync(new IdentityRole(role));
            }

            // Create default admin if doesn't exist
            var adminEmail = "admin@spt.com";
            var adminUser = await userManager.FindByEmailAsync(adminEmail);
            if (adminUser == null)
            {
                adminUser = new ApplicationUser
                {
                    UserName = adminEmail,
                    Email = adminEmail,
                    FullName = "Administrator",
                    IsActive = true,
                    EmailConfirmed = true
                };
                await userManager.CreateAsync(adminUser, "admin123");
                await userManager.AddToRoleAsync(adminUser, "Admin");
            }
        }
    }
}