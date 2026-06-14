using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Models;

namespace TeacherReporter.Data
{
    public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<SpreadsheetModel> Spreadsheets { get; set; }
        
        public DbSet<BannedUser> BannedUsers { get; set; }
        
        public DbSet<SupportMessage> SupportMessages { get; set; }

        
    }
}