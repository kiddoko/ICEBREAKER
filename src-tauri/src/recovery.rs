//! The recovery key: 24 words (the standard BIP39 English list) for 256 random
//! bits, plus a checksum that catches a typo or two words swapped. It opens the
//! vault when the password is forgotten (crypto::KeyFile's `recovery` slot).
//! Shown once, written on paper, never stored anywhere by ICEBREAKER.
//!
//! Typing it back is forgiving: any case, any spaces or line breaks, numbers in
//! front ("1. able 2. …"), and each word's first 4 letters are enough (the list
//! is made so that they're unique).

use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

pub const WORDS: usize = 24;

/// A new recovery key: (the secret, its 24 words separated by spaces).
pub fn generate() -> Result<(Zeroizing<[u8; 32]>, Zeroizing<String>), String> {
    let mut secret = Zeroizing::new([0u8; 32]);
    getrandom::getrandom(&mut secret[..]).map_err(|_| "the system gave no random bytes".to_string())?;
    let words = Mnemonic::from_entropy_in(Language::English, &secret[..]).map_err(|e| e.to_string())?;
    Ok((secret, Zeroizing::new(words.to_string())))
}

/// The 24 words typed back → the secret. Errors say which word is wrong.
pub fn parse(typed: &str) -> Result<Zeroizing<[u8; 32]>, String> {
    let list = Language::English.word_list();
    let lower = Zeroizing::new(typed.to_lowercase());
    let tokens: Vec<&str> = lower.split(|c: char| !c.is_ascii_alphabetic()).filter(|t| !t.is_empty()).collect();
    if tokens.len() != WORDS {
        return Err(format!("a recovery key is {WORDS} words ({} given)", tokens.len()));
    }
    let mut words: Vec<&str> = Vec::with_capacity(WORDS);
    for (i, t) in tokens.iter().enumerate() {
        let found = if list.contains(t) {
            Some(*t)
        } else if t.len() >= 4 {
            let mut m = list.iter().filter(|w| w.starts_with(t));
            match (m.next(), m.next()) {
                (Some(w), None) => Some(*w),
                _ => None,
            }
        } else {
            None
        };
        words.push(found.ok_or_else(|| format!("word {} (\"{t}\") isn't in the list", i + 1))?);
    }
    let phrase = Zeroizing::new(words.join(" "));
    let m = Mnemonic::parse_in_normalized(Language::English, &phrase).map_err(|_| "the words don't check out: a typo, or two words swapped?".to_string())?;
    let (entropy, len) = m.to_entropy_array();
    let mut out = Zeroizing::new([0u8; 32]);
    if len != 32 {
        return Err(format!("a recovery key is {WORDS} words"));
    }
    out.copy_from_slice(&entropy[..32]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let (secret, words) = generate().unwrap();
        assert_eq!(words.split(' ').count(), 24);
        assert_eq!(*parse(&words).unwrap(), *secret);
        // two keys differ
        assert_ne!(*generate().unwrap().1, *words);
    }

    #[test]
    fn typing_it_back_is_forgiving() {
        let (secret, words) = generate().unwrap();
        let numbered: String = words.split(' ').enumerate().map(|(i, w)| format!("{}. {}\n", i + 1, w.to_uppercase())).collect();
        assert_eq!(*parse(&numbered).unwrap(), *secret);
        let short: Vec<String> = words.split(' ').map(|w| w.chars().take(4).collect()).collect();
        assert_eq!(*parse(&short.join("  ")).unwrap(), *secret);
    }

    #[test]
    fn mistakes_are_caught_and_named() {
        let (_, words) = generate().unwrap();
        let w: Vec<&str> = words.split(' ').collect();
        assert!(parse(&w[..23].join(" ")).unwrap_err().contains("24 words"));
        let mut bad = w.clone();
        bad[6] = "notaword";
        assert!(parse(&bad.join(" ")).unwrap_err().contains("word 7"));
        // a known vector: 32 zero bytes = "abandon" ×23 + "art"
        let zero = Mnemonic::from_entropy_in(Language::English, &[0u8; 32]).unwrap().to_string();
        assert!(zero.starts_with("abandon abandon") && zero.ends_with(" art"));
        assert_eq!(*parse(&zero).unwrap(), [0u8; 32]);
        // the last word moved to the front: the checksum sees it
        let swapped = format!("art {}", "abandon ".repeat(23));
        assert!(parse(&swapped).unwrap_err().contains("don't check out"));
    }
}
