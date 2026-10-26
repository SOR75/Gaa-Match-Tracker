// Conservative local grammar, not a general-purpose commentary model.
// Every recognised candidate is explicitly confirmed before entering the event log.
export function interpretCommentary(transcript, selectedTeam = "our") {
  const words = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  let text = transcript
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) (one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, a, b) => String(words[a] + words[b]),
  );
  text = text.replace(
    new RegExp("\\b(" + Object.keys(words).join("|") + ")\\b", "g"),
    (word) => String(words[word]),
  );
  const reject = (reason) => ({
    candidate: null,
    reason,
    confidence: "uncertain",
  });
  if (
    !text ||
    /\b(not|no|maybe|perhaps|nearly|almost|think|if|would|should|wasnt|isnt|didnt|cancel|disallow|disallowed|could|might)\b/.test(
      text,
    )
  )
    return reject(
      "Uncertain or negated commentary. Correct the text or use Tap Mode.",
    );
  if (/\b(our|we)\b/.test(text) && /\b(their|they|opposition)\b/.test(text))
    return reject("Both teams mentioned. Record one event at a time.");
  const team = /\b(their|they|opposition)\b/.test(text)
    ? "opposition"
    : /\b(our|we)\b/.test(text)
      ? "our"
      : selectedTeam;
  const substitution = text.match(
    /^(?:(?:our|their|opposition)\s+)?(?:number\s+)?(\d{1,2})\s+for\s+(?:number\s+)?(\d{1,2})$/,
  );
  if (substitution) {
    const [, on, off] = substitution;
    if (+on < 1 || +off < 1 || +on > 99 || +off > 99 || +on === +off)
      return reject("Invalid substitution numbers.");
    return {
      candidate: {
        event: "substitution",
        team,
        playerOn: on,
        playerOff: off,
        outcome: "completed",
      },
      confidence: "matched",
      reason: "Substitution: on for off. Confirm the selected team.",
    };
  }
  const kickout = /\bkick\s*out\b/.test(text);
  const goal = /\bgoal\b/.test(text),
    two = /\b2\s*point(?:s)?\b/.test(text),
    point = /\bpoint\b/.test(text) && !two;
  const miss = /\b(wide|miss|missed)\b/.test(text);
  if ([kickout, goal, two, point, miss].filter(Boolean).length !== 1)
    return reject(
      "No single clear event found. Split commentary into one event per confirmation.",
    );
  const numbers = [
    ...text.matchAll(/\b(?:number|player|by(?:\s+number)?)\s+(\d{1,2})\b/g),
  ].map((match) => match[1]);
  if (new Set(numbers).size > 1)
    return reject(
      "Multiple players mentioned. Choose the event player explicitly.",
    );
  const playerNumber = numbers[0] || "";
  if (playerNumber && (+playerNumber < 1 || +playerNumber > 99))
    return reject("Player number must be 1–99.");
  // Unexplained numbers often indicate a scoreline or multiple events.
  const remainder = text
    .replace(/\b(?:number|player|by(?:\s+number)?)\s+\d{1,2}\b/g, "")
    .replace(/\b2\s*points?\b/g, "");
  if (/\d/.test(remainder))
    return reject("Unclear numbers. Say “number eight” for a player.");
  if (kickout) {
    const won = /\bwon\b/.test(text),
      lost = /\blost\b/.test(text);
    if (won === lost)
      return reject(
        "Specify kickout won or lost, from our team’s perspective.",
      );
    if (/\blong\b/.test(text) && /\bshort\b/.test(text))
      return reject("Both kickout lengths mentioned.");
    return {
      candidate: {
        event: team === "our" ? "our-kickout" : "opposition-kickout",
        kickoutPerspective: "our",
        team,
        playerNumber,
        outcome: won ? "won" : "lost",
        kickoutLength: /\blong\b/.test(text)
          ? "Long"
          : /\bshort\b/.test(text)
            ? "Short"
            : "",
      },
      confidence: "matched",
      reason: "Kickout outcome is from our team’s perspective.",
    };
  }
  return {
    candidate: {
      event: goal ? "goal" : two ? "two-point" : miss ? "miss" : "point",
      team,
      playerNumber,
      outcome: miss ? "missed" : "scored",
    },
    confidence: "matched",
    reason: "Confirm event, player and team before saving.",
  };
}
