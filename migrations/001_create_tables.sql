-- The four participants are fixed. They cannot be changed in the app.
CREATE TABLE participants (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  sort_order integer NOT NULL UNIQUE
);

INSERT INTO participants (name, sort_order) VALUES
  ('Kaspar', 1),
  ('KJ', 2),
  ('MA', 3),
  ('ML', 4);

-- A round exists once it has been saved.
CREATE TABLE rounds (
  number     integer PRIMARY KEY CHECK (number BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One score per participant per round (the primary key enforces this).
CREATE TABLE scores (
  round_number   integer NOT NULL REFERENCES rounds (number) ON DELETE CASCADE,
  participant_id integer NOT NULL REFERENCES participants (id),
  points         integer NOT NULL CHECK (points BETWEEN 0 AND 500),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_number, participant_id)
);
