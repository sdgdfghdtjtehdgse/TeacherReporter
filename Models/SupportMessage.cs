using System.ComponentModel.DataAnnotations;

namespace TeacherReporter.Models
{
    public class SupportMessage
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string SenderEmail { get; set; } = string.Empty;

        public string? Message { get; set; }

        public bool IsAdminReply { get; set; } = false;

        public DateTime SentAt { get; set; } = DateTime.UtcNow;

        public string? UserId { get; set; }

        [Required]
        public string ThreadId { get; set; } = string.Empty;

        public bool IsRead { get; set; } = false;

        // File attachment fields
        public string? FileName { get; set; }
        public string? FileStoredName { get; set; }
        public string? FileMimeType { get; set; }
        public long? FileSize { get; set; }
    }
}