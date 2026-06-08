# Test Nix file — Nexis editor playground
# Exercises: let-in, with, inherit, rec, attrsets, lists, strings,
#            functions, overlays, flakes, derivations, builtins

{ pkgs ? import <nixpkgs> {}, lib ? pkgs.lib }:

let
  # ── Basic values ──────────────────────────────────────────────────────────────

  name     = "nexis";
  version  = "1.3.0";
  isDev    = true;

  # Multi-line string (indented)
  readme = ''
    Nexis — A Tauri-based IDE
    Version: ${version}
    Platform: ${pkgs.stdenv.hostPlatform.system}
  '';

  # ── Attribute sets ────────────────────────────────────────────────────────────

  config = {
    app = {
      inherit name version;
      port    = 8080;
      tls     = false;
    };
    database = {
      host = "localhost";
      port = 5432;
      name = "${name}_dev";
    };
    features = {
      terminal  = true;
      lsp       = true;
      debugger  = true;
      ai        = isDev;
    };
  };

  # Recursive attrset (rec — members can reference each other)
  mathConsts = rec {
    pi    = 3.14159265358979;
    tau   = 2 * pi;
    e     = 2.71828182845905;
    phi   = (1 + builtins.sqrt 5) / 2;
    sqrt2 = builtins.sqrt 2;
  };

  # ── Lists ─────────────────────────────────────────────────────────────────────

  languages = [ "rust" "typescript" "python" "go" "kotlin" "swift" ];

  primes = [ 2 3 5 7 11 13 17 19 23 29 ];

  # List operations using builtins
  firstFive  = builtins.elemAt languages 0;
  langCount  = builtins.length languages;
  hasRust    = builtins.elem "rust" languages;
  upperLangs = builtins.map (s: lib.strings.toUpper s) languages;

  # ── Functions ─────────────────────────────────────────────────────────────────

  # Simple function (one arg — Nix functions are curried)
  greet = name: "Hello, ${name}!";

  # Multi-arg via currying
  add = a: b: a + b;
  mul = a: b: a * b;

  # Function with destructuring
  makeUser = { name, email, role ? "member" }: {
    inherit name email role;
    id = builtins.hashString "sha256" "${name}:${email}";
    isAdmin = role == "admin";
  };

  # Higher-order functions
  compose = f: g: x: f (g x);
  flip    = f: a: b: f b a;
  const'  = a: _b: a;

  double  = mul 2;
  triple  = mul 3;
  inc     = add 1;

  doubleTriple = compose double triple;

  # ── Fibonacci ─────────────────────────────────────────────────────────────────

  # Recursive (not tail-recursive in Nix — fine for small n)
  fibonacci = n:
    if n <= 0 then 0
    else if n == 1 then 1
    else fibonacci (n - 1) + fibonacci (n - 2);

  first12Fibs = builtins.genList fibonacci 12;

  # ── let-in, with, inherit ─────────────────────────────────────────────────────

  serverUrl =
    let
      scheme = if config.app.tls then "https" else "http";
      host   = "localhost";
      port   = config.app.port;
    in
    "${scheme}://${host}:${toString port}";

  # with — bring attrs into scope (use sparingly)
  dbDsn =
    with config.database;
    "postgresql://${host}:${toString port}/${name}";

  # inherit shorthand
  appInfo = {
    inherit name version;
    url = serverUrl;
    dsn = dbDsn;
  };

  # ── Overlay pattern ──────────────────────────────────────────────────────────

  myOverlay = final: prev: {
    nexis-tools = prev.buildEnv {
      name = "nexis-tools-${version}";
      paths = with prev; [
        rustup
        nodejs_20
        nodePackages.pnpm
        git
        jq
        ripgrep
      ];
    };
  };

  # ── Derivation (package) ──────────────────────────────────────────────────────

  nexisPackage = pkgs.stdenv.mkDerivation rec {
    pname   = name;
    inherit version;

    src = pkgs.fetchFromGitHub {
      owner = "rwetz00";
      repo  = "nexis";
      rev   = "v${version}";
      sha256 = lib.fakeSha256;  # placeholder
    };

    nativeBuildInputs = with pkgs; [
      pkg-config
      rustPlatform.cargoSetupHook
      nodePackages.pnpm
      wrapGAppsHook
    ];

    buildInputs = with pkgs; [
      openssl
      webkitgtk
      gtk3
      glib
    ] ++ lib.optionals pkgs.stdenv.isLinux [
      libayatana-appindicator
      xdotool
    ];

    buildPhase = ''
      runHook preBuild
      pnpm install --frozen-lockfile
      pnpm tauri build --bundles deb
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      install -Dm755 src-tauri/target/release/${name} $out/bin/${name}
      runHook postInstall
    '';

    meta = with lib; {
      description  = "A Tauri-based IDE with integrated terminal and AI";
      homepage     = "https://nexis.dev";
      license      = licenses.mit;
      maintainers  = [ maintainers.rwetz00 ];
      platforms    = platforms.linux ++ platforms.darwin;
      mainProgram  = name;
    };
  };

  # ── NixOS module ──────────────────────────────────────────────────────────────

  nexisModule = { config, lib, pkgs, ... }: {
    options.services.nexis = with lib; {
      enable      = mkEnableOption "Nexis IDE server";
      port        = mkOption { type = types.port; default = 8080; };
      openFirewall = mkOption { type = types.bool; default = false; };
      settings    = mkOption {
        type    = types.attrsOf types.anything;
        default = {};
      };
    };

    config = lib.mkIf config.services.nexis.enable {
      systemd.services.nexis = {
        description = "Nexis IDE server";
        wantedBy    = [ "multi-user.target" ];
        after       = [ "network.target" ];

        serviceConfig = {
          ExecStart   = "${nexisPackage}/bin/${name} --port ${toString config.services.nexis.port}";
          Restart     = "on-failure";
          User        = "nexis";
          DynamicUser = true;
          StateDirectory = name;
        };

        environment = {
          APP_PORT = toString config.services.nexis.port;
          DATA_DIR = "/var/lib/${name}";
        };
      };

      networking.firewall = lib.mkIf config.services.nexis.openFirewall {
        allowedTCPPorts = [ config.services.nexis.port ];
      };
    };
  };

  # ── flake.nix stub ────────────────────────────────────────────────────────────

  flake = {
    description = "Nexis — Tauri IDE";

    inputs = {
      nixpkgs.url     = "github:NixOS/nixpkgs/nixos-unstable";
      flake-utils.url = "github:numtide/flake-utils";
      rust-overlay    = {
        url    = "github:oxalica/rust-overlay";
        inputs = { nixpkgs.follows = "nixpkgs"; };
      };
    };

    outputs = { self, nixpkgs, flake-utils, rust-overlay, ... }:
      flake-utils.lib.eachDefaultSystem (system:
        let
          overlays = [ (import rust-overlay) myOverlay ];
          pkgs     = import nixpkgs { inherit system overlays; };
        in
        {
          packages.default = nexisPackage;

          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              (rust-bin.stable.latest.default.override {
                extensions = [ "rust-src" "rust-analyzer" ];
              })
              nodejs_20
              nodePackages.pnpm
              nexis-tools
            ];

            shellHook = ''
              echo "Nexis dev environment — ${version}"
              export RUST_LOG=nexis=debug
              export RUST_BACKTRACE=1
            '';
          };

          nixosModules.default = nexisModule;
        }
      );
  };

in
{
  # Expose for evaluation
  inherit config mathConsts languages upperLangs serverUrl dbDsn appInfo;
  inherit greet add mul double triple inc compose flip;
  fibonacci       = first12Fibs;
  package         = nexisPackage;
  module          = nexisModule;
  inherit flake;

  # Quick checks (evaluating these in nix repl shows values)
  checks = {
    greeting       = greet "Nexis";
    sum            = add 40 2;
    doubleTriple7  = doubleTriple 7;
    fibs           = first12Fibs;
    hasRust        = hasRust;
    pi             = mathConsts.pi;
    phi            = mathConsts.phi;
    alice          = makeUser { name = "Alice"; email = "alice@nexis.dev"; role = "admin"; };
    flippedSub     = (flip builtins.sub) 3 10;    # 10 - 3 = 7
  };
}
