using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeacherReporter.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportMessageAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "SupportMessages",
                type: "longtext",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "longtext")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "FileMimeType",
                table: "SupportMessages",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "FileName",
                table: "SupportMessages",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<long>(
                name: "FileSize",
                table: "SupportMessages",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FileStoredName",
                table: "SupportMessages",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FileMimeType",
                table: "SupportMessages");

            migrationBuilder.DropColumn(
                name: "FileName",
                table: "SupportMessages");

            migrationBuilder.DropColumn(
                name: "FileSize",
                table: "SupportMessages");

            migrationBuilder.DropColumn(
                name: "FileStoredName",
                table: "SupportMessages");

            migrationBuilder.UpdateData(
                table: "SupportMessages",
                keyColumn: "Message",
                keyValue: null,
                column: "Message",
                value: "");

            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "SupportMessages",
                type: "longtext",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "longtext",
                oldNullable: true)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }
    }
}
