CREATE DATABASE /*!32312 IF NOT EXISTS*/ `test`;

USE `test`;

DROP TABLE IF EXISTS `Users`;

CREATE TABLE Users(
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE INDEX UsersEmailIndex ON Users(email);

INSERT INTO Users(full_name, email)
VALUES ('Alice Henderson', 'alice@acme.org'), 
       ('Bob Sanders', 'bob@acme.org');
