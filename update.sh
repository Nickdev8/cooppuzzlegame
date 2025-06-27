#!/usr/bin/env bash
set -euo pipefail

echo "🎮 Building Godot Cooperative Puzzle Game..."

# Check if Godot is installed
if ! command -v godot &> /dev/null; then
    echo "❌ Error: Godot is not installed or not in PATH"
    echo "Please install Godot 4.4+ from https://godotengine.org/"
    echo "Skipping Godot build and continuing with other updates..."
else
    # Build the Godot game
    if [ -f "./build-godot-game.sh" ]; then
        echo "🔨 Building Godot game..."
        if ./build-godot-game.sh; then
            echo "✅ Godot game built successfully!"
        else
            echo "⚠️  Warning: Godot build failed, continuing with other updates..."
        fi
    else
        echo "⚠️  Warning: build-godot-game.sh not found, skipping Godot build..."
    fi
fi

echo "📦 Installing/updating dependencies..."

# Update server dependencies
if [ -d "server" ]; then
    echo "🔧 Updating server dependencies..."
    cd server
    npm install
    cd ..
fi

# Update client dependencies
if [ -d "client" ]; then
    echo "🔧 Updating client dependencies..."
    cd client
    npm install
    cd ..
fi

echo "✅ Dependencies updated!"

# Only commit if there are changes
if ! git diff --quiet; then
kaomojis=(
  "ヽ(・∀・)ﾉ"
  "(≧▽≦)"
  "(✿◠‿◠)"
  "(｡◕‿◕｡)"
  "٩(◕‿◕｡)۶"
  "(•̀ᴗ•́)و ̑̑"
  "(＾▽＾)"
  "(*^_^*)"
  "(─‿─)"
  "(⌒‿⌒)"
  "¯\\_(ツ)_/¯"
  "^_^"
  ":D"
  ";)"
  "(ಠ_ಠ)"
  "(ʘ‿ʘ)"
  "(¬_¬)"
  "(☉_☉)"
  "(✧ω✧)"
  "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧"
  "ヽ(´▽\`)/"
  "(๑˃ᴗ˂)ﻭ"
  "(｡♥‿♥｡)"
  "(★^O^★)"
  "(ﾉ≧ڡ≦) てへぺろ"
  "(◕‿◕✿)"
  "(づ｡◕‿‿◕｡)づ"
  "٩(^‿^)۶"
  "(☞ﾟヮﾟ)☞"
  "(´∇ﾉ｀*)ノ"
  "(ಥ﹏ಥ)"
  "(✖╭╮✖)"
  "(＾◡＾)っ"
  "(¬‿¬)"
  "(¬▂¬)"
  "(＞﹏＜)"
  "(≖ᴗ≖✿)"
  "(✌ﾟ∀ﾟ)☞"
  "(｡•́‿•̀｡)"
  "(≧ω≦)"
  "(◕‿◕)"
  "(⌒ω⌒)"
  "( ͡° ͜ʖ ͡°)"
  "(ʘᆽʘ)"
  "(ಥ_ಥ)"
  "(ʕ•ᴥ•ʔ)"
  "(=^･^=)"
  "(ღ˘⌣˘ღ)"
  "(•‿•)"
  "(୨୧ ❛⃘ੌ ᵕ ❛⃘ੌ)*･"
  "(✪‿✪)"
  "(◔̯◔)"
  "(♥ω♥*)"
  "(´｡• ᵕ •｡\`)"
  "(＾ｖ＾)"
  "(＾∀＾)"
  "(＾ω＾)"
  "(＾－＾)"
  "(￣▽￣)"
  "(￣ε￣)"
  "(￣︶￣)"
  "(￣ー￣)"
  "(￣ω￣)"
  "(￣ᆺ￣)"
  "(︶︹︺)"
  "(┳◇┳)"
  "(´•︵•\`)"
  "(╥﹏╥)"
  "(Ｔ﹏Ｔ)"
  "(Ｔ▽Ｔ)"
  "(；＿；)"
  "(ಥДಥ)"
  "(´༎ຶ▂༎ຶ\`)"
  "(´・ω・｀)"
  "(╬ಠ益ಠ)"
  "(凸ಠ益ಠ⊂)"
  "(\`皿´)"
  "(≖︿≖｡)"
  "(•̀へ•́╬)"
  "(≧Д≦)"
  "(;｀O´)>"
  "(〃｀皿´)"
  "(；￣Д￣）"
  "(ꐦ°᷄д°᷅)"
  "(⊙﹏⊙)"
  "(⊙_◎)"
  "(°ロ°) !"
  "(ノ゜Д゜)ノ"
  "(ﾟoﾟ〃)"
  "(；ﾟдﾟ)"
  "(・o・)"
  "(O_O)"
  "(TдT)"
  "(இ﹏இ )"
  "(;ω;)"
  "(;ＴДＴ)"
  "(இωஇ)"
  "(ಥ‸ಥ)"
  "(´Д⊂)"
  "｡･ﾟﾟ*(>д<)*ﾟﾟ･｡"
  "(♡˙︶˙♡)"
  "(❣‿❣)"
  "(｡♡‿♡｡)"
  "(❤ ω ❤)"
  "(❣♡❣)"
  "(♡_♡)"
  "(✿♥‿♥✿)"
  "(✿❦‿❦✿)"
  "(ღ♥‿♥ღ)"
  "(୨୧⸝⸝> ̫ <⸝⸝୨୧)"
  "(❀◕ ‿ ◕❀)"
  "(⊂(◉‿◉)つ)"
  "(づ￣ ³￣)づ"
  "(つ◕౪◕)つ━☆ﾟ.*･｡ﾟ"
  "(つ◉益◉)つ"
  "(✷‿✷)"
  "(◕‿↼)"
  "(ʕ￫ᴥ￩ʔ)"
  "(｡･ω･｡)"
  "(●´ω｀●)"
  "(～￣▽￣)～"
  "(⌒▽⌒)"
  "(～‿～)"
  "(°╭╮°)"
  "(●´∀｀●)"
  "(⌒_⌒;)"
  "(･_･;)"
  "(･ิᴗ･ิ)"
  "( ´ ▽ \` )"
  "(º_º)"
  "(*≧ω≦)"
  "(*^^*)"
  "(*￣▽￣)"
  "(*≧▽≦)"
  "(*^▽^*)"
  "(*＞▽＜)"
  "(˶‾᷄ ⁻̫ ‾᷅˵)"
  "(*^‿^*)"
  "(+_+)"
  "(^_-)"
  "(^_~)"
  "(-_-)"
  "(-_-) zzZ"
  "(-_-;)"
  "(-.-)"
  "(>_<)"
  "(＞_＜)"
  "(≻ᨎ≺)"
  "(◔_◔)"
  "(◐‿◑)"
  "(◐﹏◑)"
  "(~˘▾˘)~"
  "(▰˘︹˘▰)"
  "(ʘдʘ╬)"
)
  count=${#kaomojis[@]}
  index=$(( RANDOM % count ))
  msg=${kaomojis[index]}
  git add .
  git commit -m "$msg"
  echo "✅ Changes committed with message: $msg"
else
  echo "ℹ️  No changes to commit."
fi

echo "🚀 Pushing to remote..."
git push

echo "🌐 Deploying on remote server..."
ssh nickesselman.nl 'bash -s' <<'ENDSSH'
set -euo pipefail
cd ~/escape-room/
echo "📥 Pulling latest code..."
git pull

echo "🔧 Installing dependencies..."
# Install server dependencies
if [ -d "server" ]; then
    echo "🔧 Installing server dependencies..."
    cd server
    npm install
    cd ..
fi

# Install client dependencies
if [ -d "client" ]; then
    echo "🔧 Installing client dependencies..."
    cd client
    npm install
    cd ..
fi

echo "🎮 Building Godot game on server..."
# Check if Godot is available on the server
if command -v godot &> /dev/null; then
    if [ -f "./build-godot-game.sh" ]; then
        echo "🔨 Building Godot game..."
        if ./build-godot-game.sh; then
            echo "✅ Godot game built successfully!"
        else
            echo "⚠️  Warning: Godot build failed, continuing with deployment..."
        fi
    else
        echo "⚠️  Warning: build-godot-game.sh not found, skipping Godot build..."
    fi
else
    echo "⚠️  Warning: Godot not available on server, skipping Godot build..."
fi

echo "🚀 Running deployment script..."
if ! ./deploy.sh; then
  echo "❌ deploy.sh failed!" >&2
  exit 1
fi

echo "✅ Deployment complete!"
ENDSSH

echo "🎉 All done! Your cooperative puzzle game has been updated and deployed!"
echo ""
echo "📋 Summary:"
echo "  ✅ Godot game built (if Godot available)"
echo "  ✅ Dependencies updated"
echo "  ✅ Code committed and pushed"
echo "  ✅ Server deployed"
echo ""
echo "🌐 Your game should now be live at your server URL!"