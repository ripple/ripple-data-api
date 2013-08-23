-- phpMyAdmin SQL Dump
-- version 4.0.2
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Jun 10, 2013 at 09:07 AM
-- Server version: 5.5.31-0ubuntu0.13.04.1
-- PHP Version: 5.4.9-4ubuntu2

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `rpcharts`
--
CREATE DATABASE IF NOT EXISTS `rpcharts` DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci;
USE `rpcharts`;

-- --------------------------------------------------------

--
-- Table structure for table `caps`
--

DROP TABLE IF EXISTS `caps`;
CREATE TABLE IF NOT EXISTS `caps` (
  `c` smallint(5) unsigned NOT NULL,
  `i` smallint(5) unsigned NOT NULL,
  `type` tinyint(1) unsigned NOT NULL COMMENT '0 = circulation, 1 = hot wallet',
  `time` datetime NOT NULL,
  `ledger` int(10) unsigned NOT NULL,
  `amount` double NOT NULL,
  UNIQUE KEY `c` (`c`,`i`,`type`,`time`),
  KEY `ledger` (`ledger`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `config`
--

DROP TABLE IF EXISTS `config`;
CREATE TABLE IF NOT EXISTS `config` (
  `key` varchar(32) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ledgers`
--

DROP TABLE IF EXISTS `ledgers`;
CREATE TABLE IF NOT EXISTS `ledgers` (
  `id` int(10) unsigned NOT NULL,
  `hash` char(64) NOT NULL,
  `xrp` bigint(20) unsigned NOT NULL,
  `accounts` int(10) unsigned NOT NULL,
  `txs` mediumint(8) unsigned NOT NULL,
  `fees` int(10) unsigned NOT NULL,
  `txs_xrp_total` bigint(8) unsigned NOT NULL,
  `time` datetime NOT NULL,
  `txs_cross` mediumint(8) unsigned NOT NULL,
  `txs_trade` mediumint(8) unsigned NOT NULL,
  `evt_trade` mediumint(8) unsigned NOT NULL,
  `txs_paytrade` mediumint(8) unsigned NOT NULL,
  `entries` mediumint(8) NOT NULL,
  `offers_placed` mediumint(8) unsigned NOT NULL,
  `offers_taken` mediumint(8) unsigned NOT NULL,
  `offers_canceled` mediumint(8) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `trades`
--

DROP TABLE IF EXISTS `trades`;
CREATE TABLE IF NOT EXISTS `trades` (
  `c1` smallint(5) unsigned NOT NULL,
  `i1` smallint(5) unsigned NOT NULL,
  `c2` smallint(5) unsigned NOT NULL,
  `i2` smallint(5) unsigned NOT NULL,
  `book` smallint(5) unsigned NOT NULL,
  `time` datetime NOT NULL,
  `ledger` int(10) unsigned NOT NULL,
  `tx` smallint(5) unsigned NOT NULL,
  `order` smallint(5) unsigned NOT NULL,
  `price` double NOT NULL,
  `amount` double NOT NULL,
  KEY `ledger` (`ledger`),
  KEY `book` (`c1`,`i1`,`c2`,`i2`,`time`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

--
-- Table structure for table `articles`
--

DROP TABLE IF EXISTS `articles`;
CREATE TABLE `articles` (
  `title` varchar(100) NOT NULL,
  `category` varchar(10) NOT NULL,
  `summary` text NOT NULL,
  `url` tinytext NOT NULL,
  `publish_date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


-- First ledger
INSERT INTO `ledgers` (`id`, `hash`, `xrp`, `accounts`, `txs`, `txs_sum`, `fees`, `txs_xrp_total`, `time`, `txs_cross`, `txs_trade`, `evt_trade`, `txs_paytrade`, `entries`, `offers_placed`, `offers_taken`, `offers_canceled`) VALUES
(32570, '4109C6F2045FC7EFF4CDE8F9905D19C28820D86304080FF886B299F0206E42B5', 99999999999996320, 136, 0, 0, 0, 0, '2012-12-31 19:21:20', 0, 0, 0, 0, 0, 0, 0, 0);

-- Add txs_sum column
ALTER TABLE `ledgers` ADD `txs_sum` INT UNSIGNED NOT NULL AFTER `txs` ;
