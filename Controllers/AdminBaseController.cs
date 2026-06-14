using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TeacherReporter.Data;

namespace TeacherReporter.Controllers
{
    [Authorize(Roles = "Admin")]
    public class AdminBaseController : Controller
    {
        private readonly SupportService _supportService;

        public AdminBaseController(SupportService supportService)
        {
            _supportService = supportService;
        }

        // Runs before every action in any controller
        // that inherits from this base
        public override async Task OnActionExecutionAsync(
            ActionExecutingContext context,
            ActionExecutionDelegate next)
        {
            // Inject unread count into every admin view automatically
            ViewBag.UnreadSupportCount =
                await _supportService.GetUnreadCountAsync();
            await next();
        }
    }
}