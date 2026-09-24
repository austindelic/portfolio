use std::{env, fs, path::PathBuf};
fn main() {
    println!("cargo:rerun-if-changed=assets/posts");
    let mut posts = Vec::new();
    for entry in fs::read_dir("assets/posts").expect("Run node scripts/sync-assets.mjs") {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|x| x != "md") {
            continue;
        }
        let source = fs::read_to_string(&path).unwrap();
        let source = source.replace("\r\n", "\n");
        let rest = source.strip_prefix("---\n").expect("Missing frontmatter");
        let (front, body) = rest.split_once("\n---\n").expect("Unclosed frontmatter");
        let mut data: serde_json::Value =
            serde_yaml_ng::from_str(front).expect("Invalid frontmatter");
        if data["published"] == false {
            continue;
        }
        let slug = path.file_stem().unwrap().to_str().unwrap();
        data["slug"] = slug.into();
        data["body"] = body.into();
        posts.push(data);
    }
    posts.sort_by(|a, b| {
        b["publishDate"]
            .as_str()
            .cmp(&a["publishDate"].as_str())
            .then(a["slug"].as_str().cmp(&b["slug"].as_str()))
    });
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("posts.json");
    fs::write(out, serde_json::to_vec(&posts).unwrap()).unwrap();
}
