/*
 Navicat Premium Dump Script

 Source Server         : testmongodb
 Source Server Type    : MongoDB
 Source Server Version : 80012 (8.0.12)
 Source Host           : localhost:27017
 Source Schema         : teaching

 Target Server Type    : MongoDB
 Target Server Version : 80012 (8.0.12)
 File Encoding         : 65001

 Date: 12/07/2026 16:56:14
*/


// ----------------------------
// Collection structure for chats
// ----------------------------
db.getCollection("chats").drop();
db.createCollection("chats");
