import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXPERIMENT = ROOT / "experiments" / "codex_visual_prototype"


def test_identity_card_freezes_the_distinctive_calico_markings() -> None:
    card = json.loads((EXPERIMENT / "identity-card.json").read_text())

    assert card["schemaVersion"] == 1
    assert card["species"] == "cat"
    assert card["coatLength"] == "short"
    assert card["baseCoatColor"] == "white"
    assert card["eyeColor"] == "green"
    assert card["anatomicalMarkings"] == [
        "orange patch around the cat's anatomical left eye",
        "black patch on the cat's anatomical right ear and adjacent crown",
        "large coherent orange and black patches on the back",
        "orange and black ringed tail with a dark tip",
    ]
    assert card["accessories"] == []


def test_reference_prompt_uses_one_three_panel_master() -> None:
    prompt = (EXPERIMENT / "prompts" / "reference-master.md").read_text()

    assert "one wide three-panel contact sheet" in prompt
    assert "FRONT" in prompt
    assert "CAT_LEFT_FRONT_45" in prompt
    assert "CAT_RIGHT_FRONT_45" in prompt
    assert "Do not generate the three views independently" in prompt
    assert "no bead art" in prompt


def test_character_prompt_requires_identity_and_real_alpha() -> None:
    prompt = (EXPERIMENT / "prompts" / "character-candidates.md").read_text()

    assert "identity preservation is the highest priority" in prompt
    assert "real alpha transparency" in prompt
    assert "torso is angled about 20 degrees toward image" in prompt.lower()
    assert "tail on image right" in prompt
    assert "NOT_A_PHYSICAL_BEAD_EXPORT" in prompt


def test_reference_review_example_has_no_ambiguous_pass() -> None:
    review = json.loads(
        (EXPERIMENT / "reviews" / "reference-consistency.example.json").read_text()
    )

    required = {
        "sameIdentity",
        "viewsCorrect",
        "anatomicalMarkingsStable",
        "fullBodyVisible",
        "noExtraLimbs",
        "photographicNotBeadArt",
    }
    assert required.issubset(review)
    assert review["pass"] is True
    assert all(review[key] is True for key in required)
    assert review["violations"] == []
