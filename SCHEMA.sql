-- phpMyAdmin SQL Dump
-- version 4.0.4.2
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Sep 12, 2013 at 04:01 PM
-- Server version: 5.5.32-0ubuntu0.13.04.1
-- PHP Version: 5.4.9-4ubuntu2.3

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

--
-- Database: `rpcharts`
--
CREATE DATABASE IF NOT EXISTS `rpcharts` DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci;
USE `rpcharts`;

-- --------------------------------------------------------

--
-- Table structure for table `articles`
--

CREATE TABLE IF NOT EXISTS `articles` (
  `title` varchar(100) NOT NULL,
  `category` varchar(10) NOT NULL,
  `summary` text NOT NULL,
  `url` tinytext NOT NULL,
  `publish_date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `caps`
--

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

CREATE TABLE IF NOT EXISTS `config` (
  `key` varchar(32) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ledgers`
--

CREATE TABLE IF NOT EXISTS `ledgers` (
  `id` int(10) unsigned NOT NULL,
  `hash` char(64) NOT NULL,
  `xrp` bigint(20) unsigned NOT NULL,
  `accounts_delta` int(10) unsigned NOT NULL,
  `txs` mediumint(8) unsigned NOT NULL,
  `fees` int(10) unsigned NOT NULL,
  `txs_xrp_total` bigint(8) unsigned NOT NULL,
  `time` datetime NOT NULL,
  `txs_cross` mediumint(8) unsigned NOT NULL,
  `txs_trade` mediumint(8) unsigned NOT NULL,
  `evt_trade` mediumint(8) unsigned NOT NULL,
  `txs_paytrade` mediumint(8) unsigned NOT NULL,
  `entries_delta` mediumint(8) NOT NULL,
  `offers_placed` mediumint(8) unsigned NOT NULL,
  `offers_taken` mediumint(8) unsigned NOT NULL,
  `offers_canceled` mediumint(8) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ledgers_aggregate`
--

CREATE TABLE IF NOT EXISTS `ledgers_aggregate` (
  `time` datetime NOT NULL,
  `ledger_first` int(10) unsigned NOT NULL,
  `ledger_last` int(10) unsigned NOT NULL,
  `txs` int(10) unsigned NOT NULL,
  `accounts_delta` int(10) unsigned NOT NULL,
  UNIQUE KEY `time` (`time`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `trades`
--

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
