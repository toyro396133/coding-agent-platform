with open("lib/db/migrations/0023_oval_wild_child.sql", "r") as f:
    content = f.read()

content = "CREATE EXTENSION IF NOT EXISTS vector;\n--> statement-breakpoint\n" + content

with open("lib/db/migrations/0023_oval_wild_child.sql", "w") as f:
    f.write(content)

print("Migration updated successfully.")
