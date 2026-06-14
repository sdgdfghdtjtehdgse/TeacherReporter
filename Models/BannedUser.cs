using System.ComponentModel.DataAnnotations;

namespace TeacherReporter.Models
{
    public class BannedUser
    {
        [Key]
        public int Id { get; set; }

        public string? Email { get; set; }
        public string? IpAddress { get; set; }

        public string BannedByAdminId { get; set; } = string.Empty;
        public DateTime BannedAt { get; set; } = DateTime.UtcNow;
        public string? Reason { get; set; }
    }
}