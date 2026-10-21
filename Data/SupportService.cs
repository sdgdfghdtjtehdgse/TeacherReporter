using Microsoft.EntityFrameworkCore;

namespace TeacherReporter.Data
{
    public class SupportService
    {
        private readonly ApplicationDbContext _db;

        public SupportService(ApplicationDbContext db)
        {
            _db = db;
        }

        public async Task<int> GetUnreadCountAsync()
        {
            return await _db.SupportMessages
                .CountAsync(m => m.IsAdminReply && !m.IsRead);
        }
    }
}