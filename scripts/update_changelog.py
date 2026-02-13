import re
import sys

def remap_changelog(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # List of versions in the order they appear as headers in CHANGELOG.md
    # Based on grep -oP '## \[\d+\.\d+\.\d+\]' CHANGELOG.md
    original_versions = [
        "4.7.2", "4.7.1", "4.7.0", "4.6.1", "4.6.0", "4.5.2", "4.5.1", "4.5.0", "4.4.0",
        "4.3.1", "4.3.0", "4.2.0", "4.1.1", "4.1.0", "4.0.7", "4.0.6", "4.0.5", "4.0.4",
        "4.0.3", "4.0.2", "4.0.0", "4.0.1", "3.5.0", "3.4.0", "3.3.0", "3.2.1", "3.2.0",
        "3.1.1", "3.1.0", "3.0.0", "2.4.4", "2.4.3", "2.4.2", "2.4.1", "2.4.0", "2.3.0",
        "2.2.0", "2.1.2", "2.1.1", "2.1.0", "2.0.1", "2.0.0", "1.1.0", "0.2.0", "0.1.0"
    ]

    # Map them:
    # Latest (index 0) becomes 0.1.0
    # Next (index 1) becomes 0.0.44
    # ...
    # Oldest (index 44) becomes 0.0.1
    
    mapping = {}
    mapping["4.7.2"] = "0.1.0"
    for i in range(1, len(original_versions)):
        orig = original_versions[i]
        new_v = f"0.0.{len(original_versions) - i}"
        mapping[orig] = new_v

    # Replace headers: ## [x.y.z]
    for orig, new_v in mapping.items():
        content = content.replace(f"## [{orig}]", f"## [{new_v}]")

    # Replace versions in table: | x.y.z |
    for orig, new_v in mapping.items():
        content = content.replace(f"| {orig} |", f"| {new_v} |")

    # Replace version link labels: [x.y.z]:
    for orig, new_v in mapping.items():
        content = content.replace(f"[{orig}]:", f"[{new_v}]:")

    # Replace versions in compare links (optional but good for consistency)
    # [4.3.0]: https://github.com/.../v4.2.0...v4.3.0
    for orig, new_v in mapping.items():
        # Replace the tag part in the URL
        content = content.replace(f"...v{orig}", f"...v{new_v}")
        content = content.replace(f"v{orig}...", f"v{new_v}...")
        content = content.replace(f"tag/v{orig}", f"tag/v{new_v}")

    # Specific fix for Version History table headers if they were accidentally replaced
    content = content.replace("| [0.1.0] |", "| [0.1.0] |") # Ensure headers are not messed up

    with open(filepath, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python update_changelog.py <changelog_path>")
        sys.exit(1)
    remap_changelog(sys.argv[1])
