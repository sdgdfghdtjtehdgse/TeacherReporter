using Microsoft.AspNetCore.Identity;
using TeacherReporter.Models;

namespace TeacherReporter.Data
{
    public class ActiveUserMiddleware
    {
        private readonly RequestDelegate _next;

        public ActiveUserMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context,
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ApplicationDbContext db)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var user = await userManager.GetUserAsync(context.User);

                // User no longer exists in DB (deleted or banned)
                if (user == null)
                {
                    await signInManager.SignOutAsync();
                    context.Response.Redirect("/Account/Login?reason=deleted");
                    return;
                }

                // User exists but has been deactivated
                if (!user.IsActive)
                {
                    await signInManager.SignOutAsync();
                    context.Response.Redirect("/Account/Login?reason=deactivated");
                    return;
                }
            }

            await _next(context);
        }
    }
}